import { computed, signal } from "@preact/signals";

import type { ProjectPath, Version } from "../src/domain/paths.ts";
import type { Annotation, Decision, DocRef, Edit, LineDiff, ReviewView } from "../src/protocol.ts";
import { editOnLoad, lineDiff, retargetAnnotations, shiftAnnotations } from "../src/protocol.ts";
import { fetchReview, postDecision, subscribe } from "./api.ts";

export const review = signal<ReviewView | null>(null);

/** The comments not sent yet: a send clears them, and nothing Claude does may. */
export const annotations = signal<readonly Annotation[]>([]);

/** The document shown; `null` is the plan. */
export const current = signal<ProjectPath | null>(null);

export const split = signal(false);

export type InputMethod = "select" | "pinpoint";

export const inputMethod = signal<InputMethod>("select");

/** Ctrl or Meta held down: a pinpoint click adds to the set instead of replacing it. */
export const holding = signal(false);

/** The reviewer's own text of the plan, not sent yet: the next decision records it as the next version. */
export const edited = signal<Edit | null>(null);

/**
 * The open editor: the version and the text it opened on, kept for its whole life whatever
 * loads meanwhile, and the source line its caret starts on. `null` while the plan is rendered;
 * open, nothing can be selected, so comments wait.
 */
export type EditSession = {
  readonly version: Version;
  readonly base: string;
  readonly line: number;
};

export const editing = signal<EditSession | null>(null);

/** "Changes since" is off at every load: the reviewer reads the plan itself first. */
export const showChanges = signal(false);

export const error = signal<string | null>(null);

export const planDoc = computed<DocRef | null>(() => {
  const plan = review.value?.plan;

  // A version's file never changes: its path is the whole key.
  return plan === null || plan === undefined
    ? null
    : { path: plan.doc, mediaType: "text/markdown", modified: 0 };
});

const planText = computed(() => edited.value?.text ?? review.value?.plan?.text ?? null);

const previousText = computed(() => review.value?.plan?.previous?.text ?? null);

/**
 * The plan, or the reviewer's edit of it, against the version before; `null` at v1. Computed
 * from the two texts, not from `review`: every workspace event loads a new view, and the same
 * texts keep the same diff.
 */
export const planChanges = computed<LineDiff | null>(() =>
  planText.value === null || previousText.value === null
    ? null
    : lineDiff(previousText.value, planText.value),
);

export const docs = computed<readonly DocRef[]>(() => {
  const plan = planDoc.value;
  const listed = review.value?.docs ?? [];

  return plan === null ? listed : [plan, ...listed];
});

/** The selected document, or, once a version or an approval took it off the list, the plan or the first one. */
export const currentDoc = computed<DocRef | null>(() => {
  const list = docs.value;

  return list.find((doc) => doc.path === current.value) ?? planDoc.value ?? list[0] ?? null;
});

/** Comments are taken on a plan under review and while drafting; every other state locks the page. */
export const locked = computed(() => {
  const kind = review.value?.workspace.kind;

  return kind !== "inReview" && kind !== "drafting";
});

/** Why an open editor cannot hand its text over: said as soon as it is known, and again at Done. */
function staleEditor(editingVersion: Version, live: Version): string {
  return live === editingVersion
    ? `v${live} is no longer under review. Copy what you need, then Cancel.`
    : `v${live} arrived while you were editing v${editingVersion}. Copy what you need, then Cancel.`;
}

/** What a load makes of the unsent edit: kept, cleared because it landed, or dropped with a banner. */
function settleEdit(before: ProjectPath | undefined, view: ReviewView): void {
  const edit = edited.value;
  const { workspace, plan } = view;

  if (edit === null) return;

  const fate = editOnLoad(
    edit,
    workspace.kind === "drafting" || plan === null
      ? null
      : { version: workspace.version, text: plan.text },
  );

  if (fate === "pending") return;
  edited.value = null;

  if (fate === "stale") {
    error.value = `Your unsent edit of v${edit.version} was dropped: another version of the plan arrived. Your comments are kept.`;

    return;
  }

  // Landed: the loaded version is the edit, and the comments' lines were shifted to its text already.
  if (before !== undefined && plan !== null) {
    annotations.value = retargetAnnotations(annotations.value, before, plan.doc);
  }
}

export async function loadReview(): Promise<void> {
  const fetched = await fetchReview();

  if (!fetched.ok) {
    error.value = `GET /api/review failed: ${fetched.status}`;

    return;
  }

  const before = review.value?.plan?.doc;
  const { workspace } = fetched.value;
  review.value = fetched.value;
  settleEdit(before, fetched.value);
  const session = editing.value;

  // Last, so it wins over a dropped edit: the open editor still holds that edit's text.
  if (session !== null && workspace.kind !== "drafting" && workspace.version !== session.version) {
    error.value = staleEditor(session.version, workspace.version);
  }
}

export async function decide(decision: Decision): Promise<void> {
  const status = await postDecision(decision);

  if (status === 409) error.value = "This version was already decided.";
  else if (status >= 300) error.value = `POST /api/decision failed: ${status}`;
  else {
    annotations.value = [];
    edited.value = null;
  }

  await loadReview();
}

/** Edit: the editor opens on the version under review, on the unsent edit of it when there is one. */
export function openEditor(line: number): void {
  const view = review.value;

  if (view?.workspace.kind !== "inReview" || view.plan === null) return;
  const { version } = view.workspace;
  editing.value = { version, base: edited.value?.text ?? view.plan.text, line };
}

/**
 * Done, with the version and the text the editor opened on: the comments follow their lines
 * through the edit, and an edit back to the version's text is no edit. When another version
 * arrived meanwhile, or this one was decided elsewhere, the editor stays open: the typing must
 * stay reachable.
 */
export function finishEdit(version: Version, base: string, text: string): void {
  const view = review.value;

  if (view === null || view.plan === null || view.workspace.kind === "drafting") return;

  if (view.workspace.kind !== "inReview" || view.workspace.version !== version) {
    error.value = staleEditor(version, view.workspace.version);

    return;
  }

  annotations.value = shiftAnnotations(annotations.value, view.plan.doc, lineDiff(base, text));
  edited.value = text === view.plan.text ? null : { version, text };
  editing.value = null;
}

export function addAnnotation(annotation: Omit<Annotation, "id">): void {
  annotations.value = [...annotations.value, { ...annotation, id: crypto.randomUUID() }];
}

export function removeAnnotation(id: string): void {
  annotations.value = annotations.value.filter((annotation) => annotation.id !== id);
}

export function select(path: ProjectPath | null): void {
  if (editing.value !== null) return;
  current.value = path;

  if (path === null || path === planDoc.value?.path) split.value = false;
}

export function step(direction: 1 | -1): void {
  const list = docs.value;

  if (list.length === 0) return;
  const at = list.findIndex((doc) => doc.path === currentDoc.value?.path);
  const next = list[(at + direction + list.length) % list.length];
  select(next?.path ?? null);
}

export function listen(): void {
  subscribe(() => {
    void loadReview();
  });
}
