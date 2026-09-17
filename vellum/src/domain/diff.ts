import { diffLines } from "diff";

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
