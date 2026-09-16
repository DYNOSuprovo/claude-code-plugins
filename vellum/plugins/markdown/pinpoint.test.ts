import { describe, expect, test } from "bun:test";

import { pickTarget, tableEdge } from "./pinpoint.ts";

describe("pickTarget", () => {
  test("a paragraph is a block at 0", () => {
    expect(pickTarget(["p"], "inside")).toEqual({ index: 0, kind: "block" });
  });

  test("a heading is a block at 0", () => {
    expect(pickTarget(["h2"], "inside")).toEqual({ index: 0, kind: "block" });
  });

  test("a list item is a block at 0", () => {
    expect(pickTarget(["li", "ul"], "inside")).toEqual({ index: 0, kind: "block" });
  });

  test("a paragraph in a quote is the paragraph", () => {
    expect(pickTarget(["p", "blockquote"], "inside")).toEqual({ index: 0, kind: "block" });
  });

  test("an empty path has no target", () => {
    expect(pickTarget([], "inside")).toBeNull();
  });

  test("bold text is an inline at 0", () => {
    expect(pickTarget(["strong", "p"], "inside")).toEqual({ index: 0, kind: "inline" });
  });

  test("a link in a list item is an inline at 0", () => {
    expect(pickTarget(["a", "li", "ul"], "inside")).toEqual({ index: 0, kind: "inline" });
  });

  test("inline code is an inline at 0", () => {
    expect(pickTarget(["code", "p"], "inside")).toEqual({ index: 0, kind: "inline" });
  });

  test("code in a fenced block is the block, at the pre", () => {
    expect(pickTarget(["code", "pre"], "inside")).toEqual({ index: 1, kind: "code" });
  });

  test("inside a table the cell is the target", () => {
    expect(pickTarget(["td", "tr", "tbody", "table"], "inside")).toEqual({
      index: 0,
      kind: "cell",
    });
  });

  test("a side zone takes the row", () => {
    expect(pickTarget(["td", "tr", "tbody", "table"], "side")).toEqual({ index: 1, kind: "row" });
  });

  test("a top or bottom zone takes the table", () => {
    expect(pickTarget(["td", "tr", "tbody", "table"], "topOrBottom")).toEqual({
      index: 3,
      kind: "table",
    });
  });

  test("the edge wins over an inline in the cell", () => {
    expect(pickTarget(["strong", "td", "tr", "tbody", "table"], "side")).toEqual({
      index: 2,
      kind: "row",
    });
  });

  test("a row without a cell under the pointer is the table", () => {
    expect(pickTarget(["tr", "tbody", "table"], "inside")).toEqual({ index: 2, kind: "table" });
  });
});

describe("tableEdge", () => {
  const box = { left: 0, top: 0, right: 300, bottom: 200 };

  test("the middle is inside", () => {
    expect(tableEdge(150, 100, box)).toBe("inside");
  });

  test("within 22 px of the left edge is a side", () => {
    expect(tableEdge(10, 100, box)).toBe("side");
  });

  test("within 22 px of the bottom edge is top or bottom", () => {
    expect(tableEdge(150, 190, box)).toBe("topOrBottom");
  });

  test("a corner is top or bottom", () => {
    expect(tableEdge(10, 10, box)).toBe("topOrBottom");
  });
});
