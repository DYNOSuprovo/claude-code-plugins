import { computed, signal } from "@preact/signals";

import type { ProjectPath } from "../src/domain/paths.ts";
import type { Annotation, Decision, DocRef, LineDiff, ReviewView } from "../src/protocol.ts";
import { lineDiff } from "../src/protocol.ts";
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

const planText = computed(() => review.value?.plan?.text ?? null);

const previousText = computed(() => review.value?.plan?.previous?.text ?? null);

/**
 * The plan against the version before it, `null` at v1. Computed from the two texts, not from
 * `review`: every workspace event loads a new view, and the same texts keep the same diff.
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

export async function loadReview(): Promise<void> {
  const fetched = await fetchReview();

  if (!fetched.ok) {
    error.value = `GET /api/review failed: ${fetched.status}`;

    return;
  }

  review.value = fetched.value;
}

export async function decide(decision: Decision): Promise<void> {
  const status = await postDecision(decision);

  if (status === 409) error.value = "This version was already decided.";
  else if (status >= 300) error.value = `POST /api/decision failed: ${status}`;
  else annotations.value = [];
  await loadReview();
}

export function addAnnotation(annotation: Omit<Annotation, "id">): void {
  annotations.value = [...annotations.value, { ...annotation, id: crypto.randomUUID() }];
}

export function removeAnnotation(id: string): void {
  annotations.value = annotations.value.filter((annotation) => annotation.id !== id);
}

export function select(path: ProjectPath | null): void {
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
