import { describe, expect, test } from "bun:test";

import { offsetOfLine } from "./caret.ts";

describe("offsetOfLine", () => {
  test("the first line starts at 0", () => {
    expect(offsetOfLine("a\nbb\nccc\n", 1)).toBe(0);
  });

  test("a line starts after the lines before it and their newlines", () => {
    expect(offsetOfLine("a\nbb\nccc\n", 3)).toBe(5);
  });

  test("a line past the end is the end of the text", () => {
    expect(offsetOfLine("a\nbb\n", 9)).toBe(5);
  });
});
