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

/**
 * Whether `line` of the text before is in a removed run no added run follows: the quote that
 * sat there is gone. A removed run an added run follows is a replacement, which `shiftLine`
 * maps to the lines that took its place.
 */
function removedAt(diff: LineDiff, line: number): boolean {
  return diff.some(
    (run, index) =>
      run.kind === "removed" &&
      run.before <= line &&
      line < run.before + run.lines.length &&
      diff[index + 1]?.kind !== "added",
  );
}

function removedLines(diff: LineDiff, lines: readonly [number, number]): boolean {
  return removedAt(diff, lines[0]) || removedAt(diff, lines[1]);
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

/** The three texts of a Done: the version's, the one the editor opened on, the one typed. */
export type EditTexts = {
  readonly version: string;
  readonly base: string;
  readonly text: string;
};

/**
 * Done: the text passages of `doc`'s annotations follow their lines through the edit. One whose
 * lines the edit removed is marked `removed` and takes the version's lines, whatever edit it was
 * made on, so the feedback and Discard edit read them as the version's; one already removed is
 * judged against the version again, and comes back on its new line once its text does. Every
 * other annotation is returned as is.
 */
export function shiftAnnotations(
  annotations: readonly Annotation[],
  doc: ProjectPath,
  texts: EditTexts,
): readonly Annotation[] {
  const edit = lineDiff(texts.base, texts.text);
  const toVersion = lineDiff(texts.base, texts.version);
  const fromVersion = lineDiff(texts.version, texts.text);

  return mapPassages(annotations, doc, (passage) => {
    if (passage.removed) {
      return removedLines(fromVersion, passage.lines)
        ? passage
        : { ...passage, removed: false, lines: shiftLines(fromVersion, passage.lines) };
    }

    return removedLines(edit, passage.lines)
      ? { ...passage, removed: true, lines: shiftLines(toVersion, passage.lines) }
      : { ...passage, lines: shiftLines(edit, passage.lines) };
  });
}

/**
 * Discard edit, the reverse: the passages not removed are shifted by the diff back to the
 * version's text, and the removed ones are removed no more, their lines intact. A passage on a
 * line only the edit holds, one `removedLines` finds in the diff back, goes with the edit, and
 * a comment left with no passage goes whole.
 */
export function unshiftAnnotations(
  annotations: readonly Annotation[],
  doc: ProjectPath,
  diff: LineDiff,
): readonly Annotation[] {
  return annotations.flatMap((annotation) => {
    if (annotation.doc !== doc || annotation.anchor.kind !== "text") return [annotation];

    const [first, ...rest] = annotation.anchor.passages.flatMap((passage) => {
      if (passage.removed) return [{ ...passage, removed: false }];

      return removedLines(diff, passage.lines)
        ? []
        : [{ ...passage, lines: shiftLines(diff, passage.lines) }];
    });

    return first === undefined
      ? []
      : [{ ...annotation, anchor: { kind: "text", passages: [first, ...rest] } }];
  });
}

/** How many comments Discard edit takes whole: those left with no passage by `unshiftAnnotations`. */
export function goneWithEdit(
  annotations: readonly Annotation[],
  doc: ProjectPath,
  diff: LineDiff,
): number {
  return annotations.length - unshiftAnnotations(annotations, doc, diff).length;
}
