/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures and expectations here are branded values (Version, ProjectPath, WipDir) written as literals: the brand is the parser's to grant, and the test is what checks the parser. */
import { describe, expect, test } from "bun:test";

import { decideOn, gateVersion, slugFor } from "./review.ts";
import type { PlanWorkspace } from "./workspace.ts";

const DIR = "plans/2026-09-15/wip-4c2a9d93/" as never;

const V1 = 1 as never;

const drafting: PlanWorkspace = { kind: "drafting", dir: DIR, batches: 2 };

const inReview: PlanWorkspace = { kind: "inReview", dir: DIR, version: V1, finalizeError: null };

const changesRequested: PlanWorkspace = { kind: "changesRequested", dir: DIR, version: V1 };

const approved: PlanWorkspace = {
  kind: "approved",
  dir: "plans/2026-09-15/notes/" as never,
  version: V1,
};

describe("gateVersion", () => {
  test("the first plan is v1", () => {
    expect(gateVersion(drafting, null, "# P\n")).toEqual({ kind: "recorded", version: V1 });
  });

  test("the same text under review keeps its number", () => {
    expect(gateVersion(inReview, "# P\n", "# P\n")).toEqual({ kind: "kept", version: V1 });
  });

  test.each([
    ["the same text after a feedback", changesRequested, "# P\n"],
    ["a new text", inReview, "# Q\n"],
  ] as const)("%s is the next version", (_name, workspace, plan) => {
    expect(gateVersion(workspace, "# P\n", plan)).toEqual({
      kind: "recorded",
      version: 2 as never,
    });
  });
});

describe("decideOn", () => {
  test("approve names the version to finalize", () => {
    expect(decideOn(inReview, { kind: "approve" })).toEqual({ kind: "approve", version: V1 });
  });

  test("feedback names the file to write", () => {
    expect(decideOn(inReview, { kind: "feedback", annotations: [] })).toEqual({
      kind: "feedback",
      path: `${DIR}.review/v1.feedback.md` as never,
      version: V1,
    });
  });

  test("a feedback while drafting is the next batch", () => {
    expect(decideOn(drafting, { kind: "feedback", annotations: [] })).toEqual({
      kind: "draftFeedback",
      batch: 3,
      path: `${DIR}.review/v0.feedback-3.md` as never,
    });
  });

  test.each([drafting, changesRequested, approved])("approve is refused on $kind", (workspace) => {
    expect(decideOn(workspace, { kind: "approve" })).toEqual({ kind: "refused" });
  });
});

describe("slugFor", () => {
  test("the title first, the plan file's name without one", () => {
    expect(slugFor("# Notes\n")).toEqual({ ok: true, value: "notes" as never });
    expect(slugFor("no heading")).toEqual({ ok: true, value: "plan" as never });
  });
});
