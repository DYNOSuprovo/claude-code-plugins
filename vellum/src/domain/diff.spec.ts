import { describe, expect, test } from "bun:test";

import { countChanges, lineDiff } from "./diff.ts";

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
