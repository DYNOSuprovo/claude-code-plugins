import { describe, expect, test } from "bun:test";

import { parseVerdict } from "./parse.ts";

function verdict(...body: string[]): string {
  return ["## Plan review", "", ...body].join("\n");
}

const APPROVED = ["Status: Approved", "", "Verdict: right - one slice per concern"];

describe("parseVerdict", () => {
  test("a verdict crosses with its status, its size and both lists, anchored and not", () => {
    const text = verdict(
      "Status: Issues found",
      "",
      "Issues:",
      "- [Slices] lines 12–14: slice 2 names no check - nobody can tell it is done",
      "  > wire the parser into the page",
      "- [Decisions] the request is never restated - the gap cannot be read",
      "",
      "Verdict: overengineered - a config file nobody asked for",
      "",
      "Advisory (does not block):",
      "- split the plan in two",
    );

    expect(parseVerdict(text)).toEqual({
      status: "issuesFound",
      size: { kind: "overengineered", why: "a config file nobody asked for" },
      issues: [
        {
          section: "Slices",
          text: "slice 2 names no check - nobody can tell it is done",
          place: { lines: [12, 14], quote: "wire the parser into the page" },
        },
        {
          section: "Decisions",
          text: "the request is never restated - the gap cannot be read",
          place: null,
        },
      ],
      advisories: [{ section: null, text: "split the plan in two", place: null }],
    });
  });

  test("a verdict with no list crosses with two empty ones", () => {
    expect(parseVerdict(verdict(...APPROVED))).toEqual({
      status: "approved",
      size: { kind: "right", why: "one slice per concern" },
      issues: [],
      advisories: [],
    });
  });

  test("a finding missing its quote has no place, and keeps its lines in its text", () => {
    const text = verdict(...APPROVED, "", "Issues:", "- [Order] lines 3–4: a late decision - x");

    expect(parseVerdict(text)?.issues).toEqual([
      { section: "Order", text: "lines 3–4: a late decision - x", place: null },
    ]);
  });

  test("a quote under a finding with no lines has no place, and stays in its text", () => {
    const text = verdict(...APPROVED, "", "Issues:", "- [Order] a late decision", "  > use Bun");

    expect(parseVerdict(text)?.issues).toEqual([
      { section: "Order", text: "a late decision\n> use Bun", place: null },
    ]);
  });

  test("one line alone is a range of one, and a reversed range is no place", () => {
    const text = verdict(
      ...APPROVED,
      "",
      "Issues:",
      "- line 7: a",
      "  > x",
      "- lines 9–8: b",
      "  > y",
    );

    expect(parseVerdict(text)?.issues.map((finding) => finding.place)).toEqual([
      { lines: [7, 7], quote: "x" },
      null,
    ]);
  });

  test("the format's markers inside a finding or its quote are its text", () => {
    const text = verdict(
      ...APPROVED,
      "",
      "Issues:",
      "- [Output] lines 5–5: prints Status: Approved and Verdict: right - x",
      "  > Issues:",
      "  > - [Size] Verdict: right - y",
    );

    expect(parseVerdict(text)?.issues).toEqual([
      {
        section: "Output",
        text: "prints Status: Approved and Verdict: right - x",
        place: { lines: [5, 5], quote: "Issues:\n- [Size] Verdict: right - y" },
      },
    ]);
  });

  test("what the agent says before the heading is left out", () => {
    const text = `I read the plan and its artifacts.\nStatus: Issues found\n\n${verdict(...APPROVED)}`;

    expect(parseVerdict(text)?.status).toBe("approved");
  });

  test("a text that is not a verdict is refused", () => {
    expect(parseVerdict(APPROVED.join("\n"))).toBeNull();
    expect(parseVerdict(verdict("Verdict: right - x"))).toBeNull();
    expect(parseVerdict(verdict("Status: Approved"))).toBeNull();
    expect(parseVerdict(verdict("Status: Fine", "Verdict: right - x"))).toBeNull();
    expect(parseVerdict(verdict("Status: Approved", "Verdict: tidy - x"))).toBeNull();
  });

  test("a line the format does not name refuses the whole verdict", () => {
    expect(parseVerdict(verdict(...APPROVED, "Status: Approved"))).toBeNull();
    expect(parseVerdict(verdict(...APPROVED, "- a finding outside any list"))).toBeNull();
    expect(
      parseVerdict(verdict(...APPROVED, "Issues:", "  > a quote under no finding")),
    ).toBeNull();
    expect(parseVerdict(verdict(...APPROVED, "Issues:", "None."))).toBeNull();
  });
});
