import { diffLines } from "diff";

import type { Annotation, Passage } from "./feedback.ts";
import type { ProjectPath } from "./paths.ts";

/**
 * Two texts compared line by line, as the runs the page draws and counts. The comparison is
 * jsdiff's; the runs carry both line cursors, so nothing downstream counts lines again.
 */

/** One run of lines, 1-based. `at` is the line of `after` the removed lines sat before. */
export type DiffRun =
  | {
      readonly kind: "same";
      readonly before: number;
      readonly after: number;
      readonly count: number;
    }
  | { readonly kind: "added"; readonly after: number; readonly count: number }
  | {
      readonly kind: "removed";
      readonly before: number;
      readonly at: number;
      readonly lines: readonly string[];
    };

export type LineDiff = readonly DiffRun[];

export function lineDiff(before: string, after: string): LineDiff {
  const runs: DiffRun[] = [];
  let beforeLine = 1;
  let afterLine = 1;

  for (const change of diffLines(before, after)) {
    if (change.removed) {
      const lines = change.value.replace(/\n$/u, "").split("\n");
      runs.push({ kind: "removed", before: beforeLine, at: afterLine, lines });
      beforeLine += change.count;
    } else if (change.added) {
      runs.push({ kind: "added", after: afterLine, count: change.count });
      afterLine += change.count;
    } else {
      runs.push({ kind: "same", before: beforeLine, after: afterLine, count: change.count });
      beforeLine += change.count;
      afterLine += change.count;
    }
  }

  return runs;
}

/** Lines added and removed, as the bar prints them. */
export type ChangeCount = { readonly added: number; readonly removed: number };

export function countChanges(diff: LineDiff): ChangeCount {
  let added = 0;
  let removed = 0;

  for (const run of diff) {
    if (run.kind === "added") added += run.count;

    if (run.kind === "removed") removed += run.lines.length;
  }

  return { added, removed };
}

/** A line no run holds was read from another text: it maps to the last line, so a range stays in order. */
function shiftLine(diff: LineDiff, line: number): number {
  let last = 0;
  let shifted: number | null = null;

  for (const run of diff) {
    if (run.kind !== "removed") last += run.count;

    if (run.kind === "same" && run.before <= line && line < run.before + run.count) {
      shifted = run.after + line - run.before;
    }

    if (run.kind === "removed" && run.before <= line && line < run.before + run.lines.length) {
      shifted = run.at;
    }
  }

  return Math.max(1, Math.min(shifted ?? last, last));
}

/** Total: a kept line maps to its new number, a removed one to where it sat, never past the last line. */
export function shiftLines(
  diff: LineDiff,
  lines: readonly [number, number],
): readonly [number, number] {
  return [shiftLine(diff, lines[0]), shiftLine(diff, lines[1])];
}

/** Whether `line` of the text before is in a removed run: the quote that sat there is gone. */
function removedAt(diff: LineDiff, line: number): boolean {
  return diff.some(
    (run) => run.kind === "removed" && run.before <= line && line < run.before + run.lines.length,
  );
}

function mapPassages(
  annotations: readonly Annotation[],
  doc: ProjectPath,
  map: (passage: Passage) => Passage,
): readonly Annotation[] {
  return annotations.map((annotation) => {
    if (annotation.doc !== doc || annotation.anchor.kind !== "text") return annotation;
    const [first, ...rest] = annotation.anchor.passages;
    const passages = [map(first), ...rest.map((passage) => map(passage))] as const;

    return { ...annotation, anchor: { kind: "text", passages } };
  });
}

/**
 * Done: the text passages of `doc`'s annotations follow their lines through the edit; one whose
 * lines the edit removed keeps them and is marked `removed`, since the diff back could not find
 * a line it had moved. Every other annotation is returned as is.
 */
export function shiftAnnotations(
  annotations: readonly Annotation[],
  doc: ProjectPath,
  diff: LineDiff,
): readonly Annotation[] {
  return mapPassages(annotations, doc, (passage) => {
    if (passage.removed) return passage;
    const [start, end] = passage.lines;

    return removedAt(diff, start) || removedAt(diff, end)
      ? { ...passage, removed: true }
      : { ...passage, lines: shiftLines(diff, passage.lines) };
  });
}

/**
 * Discard edit, the reverse: the passages not removed are shifted by the diff back to the
 * version's text, and the removed ones are removed no more, their lines intact.
 */
export function unshiftAnnotations(
  annotations: readonly Annotation[],
  doc: ProjectPath,
  diff: LineDiff,
): readonly Annotation[] {
  return mapPassages(annotations, doc, (passage) =>
    passage.removed
      ? { ...passage, removed: false }
      : { ...passage, lines: shiftLines(diff, passage.lines) },
  );
}
