/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures here are branded values (ProjectPath) written as literals: the brand is the parser's to grant. */
import { describe, expect, test } from "bun:test";

import type { LineDiff } from "./diff.ts";
import {
  countChanges,
  lineDiff,
  shiftAnnotations,
  shiftLines,
  unshiftAnnotations,
} from "./diff.ts";
import type { Annotation } from "./feedback.ts";

describe("lineDiff", () => {
  test("two equal texts are one same run", () => {
    expect(lineDiff("a\nb\nc\n", "a\nb\nc\n")).toEqual([
      { kind: "same", before: 1, after: 1, count: 3 },
    ]);
  });

  test("a line replaced is a removed run, then an added run at the same place", () => {
    expect(lineDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      { kind: "same", before: 1, after: 1, count: 1 },
      { kind: "removed", before: 2, at: 2, lines: ["b"] },
      { kind: "added", after: 2, count: 1 },
      { kind: "same", before: 3, after: 3, count: 1 },
    ]);
  });

  test("lines removed at the end sit one past the last line", () => {
    expect(lineDiff("a\nb\nc\n", "a\n")).toEqual([
      { kind: "same", before: 1, after: 1, count: 1 },
      { kind: "removed", before: 2, at: 2, lines: ["b", "c"] },
    ]);
  });
});

describe("countChanges", () => {
  test("one line replaced and two added count three added, one removed", () => {
    expect(countChanges(lineDiff("a\nb\n", "a\nB\nc\nd\n"))).toEqual({ added: 3, removed: 1 });
  });
});

const TWO_ABOVE: LineDiff = [
  { kind: "added", after: 1, count: 2 },
  { kind: "same", before: 1, after: 3, count: 60 },
];

describe("shiftLines", () => {
  test("two lines added above move a line down by two", () => {
    expect(shiftLines(TWO_ABOVE, [41, 41])).toEqual([43, 43]);
  });

  test("a removed line maps to where it sat", () => {
    const diff: LineDiff = [
      ...TWO_ABOVE.slice(0, 1),
      { kind: "same", before: 1, after: 3, count: 10 },
      { kind: "removed", before: 11, at: 13, lines: ["gone"] },
      { kind: "same", before: 12, after: 13, count: 5 },
    ];

    expect(shiftLines(diff, [11, 12])).toEqual([13, 13]);
  });

  test("a line removed at the end maps to the last line, not past it", () => {
    expect(shiftLines(lineDiff("a\nb\nc\n", "a\n"), [3, 3])).toEqual([1, 1]);
  });

  test("a line past the text it was read from maps to the last line, and the range stays in order", () => {
    expect(shiftLines(lineDiff("l40\n", "n1\nn2\nl40\n"), [1, 2])).toEqual([3, 3]);
  });

  test("against an empty text every line maps to 1", () => {
    expect(shiftLines(lineDiff("a\nb\n", ""), [2, 2])).toEqual([1, 1]);
  });
});

const PLAN = "plans/2026-09-15/wip-4c2a9d93/.review/v2.md" as never;

const ARTIFACT = "plans/2026-09-15/wip-4c2a9d93/notes.md" as never;

function deleteAt(
  doc: Annotation["doc"],
  lines: readonly [number, number],
  removed = false,
): Annotation {
  const passage = { quote: "fast enough", prefix: "", suffix: "", lines, removed };

  return { id: "a", doc, anchor: { kind: "text", passages: [passage] }, mark: { kind: "delete" } };
}

/** `l1` to `l<count>`, one per line. */
function text(count: number): string {
  return Array.from({ length: count }, (_, index) => `l${index + 1}\n`).join("");
}

const VERSION = text(60);

/** A first Done: the editor opened on the version itself. */
function firstEdit(edited: string): Parameters<typeof shiftAnnotations>[2] {
  return { version: VERSION, base: VERSION, text: edited };
}

describe("shiftAnnotations", () => {
  test("the document's passages move, and the mark rides along", () => {
    const edit = firstEdit(`n1\nn2\n${VERSION}`);
    expect(shiftAnnotations([deleteAt(PLAN, [41, 41])], PLAN, edit)).toEqual([
      deleteAt(PLAN, [43, 43]),
    ]);
  });

  test("a passage whose lines the edit removed keeps its lines and is marked removed", () => {
    const edit = firstEdit(`n1\nn2\n${VERSION.replace("l11\n", "")}`);
    expect(shiftAnnotations([deleteAt(PLAN, [11, 11])], PLAN, edit)).toEqual([
      deleteAt(PLAN, [11, 11], true),
    ]);
  });

  test("a passage that ends on a removed line is removed too, its lines kept", () => {
    const edit = firstEdit(`n1\nn2\n${VERSION.replace("l11\n", "")}`);
    expect(shiftAnnotations([deleteAt(PLAN, [10, 11])], PLAN, edit)).toEqual([
      deleteAt(PLAN, [10, 11], true),
    ]);
  });

  test("a passage on a line the edit replaced follows the replacement", () => {
    const edit = firstEdit(VERSION.replace("l11\n", "L11\n"));
    expect(shiftAnnotations([deleteAt(PLAN, [11, 11])], PLAN, edit)).toEqual([
      deleteAt(PLAN, [11, 11]),
    ]);
  });

  test("a passage removed on a second edit takes the version's lines, not the first edit's", () => {
    const base = `n1\nn2\nn3\n${VERSION}`;
    const edit = { version: VERSION, base, text: base.replace("l11\n", "") };
    expect(shiftAnnotations([deleteAt(PLAN, [14, 14])], PLAN, edit)).toEqual([
      deleteAt(PLAN, [11, 11], true),
    ]);
  });

  test("a passage already removed keeps its lines while its text stays out", () => {
    const base = VERSION.replace("l11\n", "");
    const edit = { version: VERSION, base, text: `n1\nn2\n${base}` };
    expect(shiftAnnotations([deleteAt(PLAN, [11, 11], true)], PLAN, edit)).toEqual([
      deleteAt(PLAN, [11, 11], true),
    ]);
  });

  test("a passage already removed is removed no more once an edit puts its text back, on its new line", () => {
    const base = VERSION.replace("l11\n", "");
    const edit = { version: VERSION, base, text: `n1\nn2\n${VERSION}` };
    expect(shiftAnnotations([deleteAt(PLAN, [11, 11], true)], PLAN, edit)).toEqual([
      deleteAt(PLAN, [13, 13]),
    ]);
  });

  test("another document's annotation and a global one come back unchanged", () => {
    const general: Annotation = {
      id: "g",
      doc: PLAN,
      anchor: { kind: "global" },
      mark: { kind: "comment", body: "No." },
    };

    const others = [deleteAt(ARTIFACT, [41, 41]), general];
    expect(shiftAnnotations(others, PLAN, firstEdit(`n1\nn2\n${VERSION}`))).toEqual(others);
  });
});

describe("unshiftAnnotations", () => {
  test("the reverse of Done: a shifted passage comes back, a removed one is removed no more, its lines intact", () => {
    const before = "a\nb\nc\nd\n";
    const after = "new\na\nc\nd\n";

    const shifted = shiftAnnotations(
      [deleteAt(PLAN, [2, 2]), { ...deleteAt(PLAN, [4, 4]), id: "b" }],
      PLAN,
      { version: before, base: before, text: after },
    );

    expect(shifted).toEqual([deleteAt(PLAN, [2, 2], true), { ...deleteAt(PLAN, [4, 4]), id: "b" }]);
    expect(unshiftAnnotations(shifted, PLAN, lineDiff(after, before))).toEqual([
      deleteAt(PLAN, [2, 2]),
      { ...deleteAt(PLAN, [4, 4]), id: "b" },
    ]);
  });

  test("another document's annotation comes back unchanged", () => {
    const other = [deleteAt(ARTIFACT, [41, 41], true)];
    expect(unshiftAnnotations(other, PLAN, TWO_ABOVE)).toEqual(other);
  });
});
