import { describe, expect, test } from "bun:test";

import { passageOf } from "./passage.ts";

function version(lines: Record<number, string>, length = 30): string {
  return Array.from({ length }, (_, index) => lines[index + 1] ?? `filler ${index + 1}`).join("\n");
}

describe("passageOf", () => {
  test("a quote found in its lines is a whole passage, on the quote's own line", () => {
    const text = "# Plan\n\n## Slices\n\n1. Wire the parser into the page, then test it.\n";

    expect(passageOf(text, { lines: [5, 5], quote: "the parser into the page" })).toEqual({
      kind: "prose",
      quote: "the parser into the page",
      prefix: "# Plan\n\n## Slices\n\n1. Wire ",
      suffix: ", then test it.\n",
      lines: [5, 5],
      removed: false,
    });
  });

  test("a quote absent from the text is no passage", () => {
    const text = version({ 12: "Wire the parser into the page." });

    expect(passageOf(text, { lines: [12, 12], quote: "wire the reader" })).toBeNull();
  });

  test("a range off by a few lines still finds the quote, and gives its real line", () => {
    const text = version({ 15: "Wire the parser into the page." });

    expect(passageOf(text, { lines: [12, 12], quote: "the parser" })?.lines).toEqual([15, 15]);
  });

  test("a quote far from its range is no passage", () => {
    const text = version({ 28: "Wire the parser into the page." });

    expect(passageOf(text, { lines: [3, 4], quote: "the parser" })).toBeNull();
  });

  test("a repeated quote is the occurrence nearest its range", () => {
    const text = version({ 4: "Run the check.", 20: "Run the check.", 26: "Run the check." });

    expect(passageOf(text, { lines: [21, 22], quote: "Run the check" })?.lines).toEqual([20, 20]);
  });

  test("a quote carrying Markdown markup is no passage: the page shows no markup", () => {
    const text = version({ 9: "Call `parseVerdict` on **every** [file](a.md)." });

    expect(passageOf(text, { lines: [9, 9], quote: "Call `parseVerdict`" })).toBeNull();
    expect(passageOf(text, { lines: [9, 9], quote: "on **every**" })).toBeNull();
    expect(passageOf(text, { lines: [9, 9], quote: "[file](a.md)" })).toBeNull();
    expect(passageOf(text, { lines: [9, 9], quote: "parseVerdict" })?.lines).toEqual([9, 9]);
  });

  test("words read on the page across markup are not in the source, so no passage", () => {
    const text = version({ 9: "Call `parseVerdict` on **every** file." });

    expect(passageOf(text, { lines: [9, 9], quote: "on every file" })).toBeNull();
  });

  test("a quote over two lines is no passage: the page joins no two blocks as the source does", () => {
    const text = version({ 9: "- first item", 10: "- second item" });

    expect(passageOf(text, { lines: [9, 10], quote: "first item\n- second" })).toBeNull();
  });
});
