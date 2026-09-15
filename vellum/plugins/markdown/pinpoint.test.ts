import { describe, expect, test } from "bun:test";

import { pickTarget } from "./pinpoint.ts";

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
});
