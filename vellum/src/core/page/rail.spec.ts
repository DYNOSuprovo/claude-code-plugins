/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- the fixtures are branded values (Version, WipDir, FinalDir) written as literals: the brand is the parser's to grant, and nothing here parses. */
import { describe, expect, test } from "bun:test";

import { dirOf, planLabel } from "./rail.ts";

describe("dirOf", () => {
  test("a file at the project root has no folder", () => {
    expect(dirOf("AGENTS.md")).toBe("");
  });

  test("a file one folder down prints that folder", () => {
    expect(dirOf("vellum/AGENTS.md")).toBe("vellum");
  });

  test("a nested file prints its last folder, not the whole path", () => {
    expect(dirOf("vellum/.claude/rules/page.md")).toBe("rules");
  });
});

describe("planLabel", () => {
  const dir = "plans/2026-09-15/wip-4c2a9d93/" as never;

  test("before the first version the plate says draft", () => {
    expect(planLabel({ kind: "drafting", dir, batches: 0 })).toBe("draft");
  });

  test("under review it prints the version", () => {
    const version = 3 as never;
    expect(planLabel({ kind: "inReview", dir, version, batches: 0, finalizeError: null })).toBe(
      "v3",
    );
  });

  test("changes requested keeps the version that was decided", () => {
    expect(planLabel({ kind: "changesRequested", dir, version: 2 as never })).toBe("v2");
  });

  test("once approved it prints the approved version", () => {
    const final = "plans/2026-09-15/notification-settings/" as never;
    expect(planLabel({ kind: "approved", dir: final, version: 4 as never, notes: false })).toBe(
      "v4",
    );
  });
});
