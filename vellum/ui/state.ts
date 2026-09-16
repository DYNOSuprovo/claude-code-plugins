import { computed, signal } from "@preact/signals";

import type { ProjectPath } from "../src/domain/paths.ts";
import type { Annotation, Decision, DocRef, PlanWorkspace, ReviewView } from "../src/protocol.ts";
import { fetchReview, postDecision, subscribe } from "./api.ts";

export const review = signal<ReviewView | null>(null);

export const annotations = signal<readonly Annotation[]>([]);

/** The document shown; `null` is the plan. */
export const current = signal<ProjectPath | null>(null);

export const split = signal(false);

export type InputMethod = "select" | "pinpoint";

export const inputMethod = signal<InputMethod>("select");

export const error = signal<string | null>(null);

export const planDoc = computed<DocRef | null>(() => {
  const plan = review.value?.plan;

  return plan === null || plan === undefined
    ? null
    : { path: plan.doc, mediaType: "text/markdown" };
});

export const docs = computed<readonly DocRef[]>(() => {
  const plan = planDoc.value;
  const listed = review.value?.docs ?? [];

  return plan === null ? listed : [plan, ...listed];
});

export const currentDoc = computed<DocRef | null>(() => {
  const list = docs.value;
  const wanted = current.value ?? planDoc.value?.path ?? list[0]?.path;

  return list.find((doc) => doc.path === wanted) ?? null;
});

/** Comments are taken on a plan under review and while drafting; every other state locks the page. */
export const locked = computed(() => {
  const kind = review.value?.workspace.kind;

  return kind !== "inReview" && kind !== "drafting";
});

/** The round the comments belong to: a version, or the batches already sent while drafting. */
function roundOf(workspace: PlanWorkspace | undefined): string {
  if (workspace === undefined) return "";

  return workspace.kind === "drafting" ? `drafts ${workspace.batches}` : `v${workspace.version}`;
}

export async function loadReview(): Promise<void> {
  const fetched = await fetchReview();

  if (!fetched.ok) {
    error.value = `GET /api/review failed: ${fetched.status}`;

    return;
  }

  const previous = review.value?.workspace;
  review.value = fetched.value;

  if (roundOf(previous) !== roundOf(fetched.value.workspace)) annotations.value = [];
}

export async function decide(decision: Decision): Promise<void> {
  const status = await postDecision(decision);

  if (status === 409) error.value = "This version was already decided.";
  else if (status >= 300) error.value = `POST /api/decision failed: ${status}`;
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
