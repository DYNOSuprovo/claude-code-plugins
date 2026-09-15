import { describe, expect, test } from "bun:test";

import type { Root, RootContent } from "hast";

import { toTree } from "./tree.ts";

function linesOf(text: string, tag: string): unknown[] {
  const found: unknown[] = [];

  const walk = (node: Root | RootContent): void => {
    if (node.type === "element" && node.tagName === tag) found.push(node.properties.dataLines);

    if ("children" in node) for (const child of node.children) walk(child);
  };

  walk(toTree(text));

  return found;
}

describe("toTree", () => {
  test("a list item's lines stop before its nested list", () => {
    expect(linesOf("- First item\n  - Nested one\n  - Nested two\n- Second item\n", "li")).toEqual([
      "1-1",
      "2-2",
      "3-3",
      "4-4",
    ]);
  });

  test("a loose item stops before its nested list, even with text after it", () => {
    expect(linesOf("- First\n  continued\n\n  - Nested\n\n  after\n", "li")).toEqual([
      "1-2",
      "4-4",
    ]);
  });

  test("a list keeps its full lines", () => {
    expect(linesOf("- First item\n  - Nested one\n  - Nested two\n- Second item\n", "ul")).toEqual([
      "1-4",
      "2-3",
    ]);
  });
});
