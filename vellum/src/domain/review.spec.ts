/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures and expectations here are branded values (Version, ProjectPath, WipDir) written as literals: the brand is the parser's to grant, and the test is what checks the parser. */
import { describe, expect, test } from "bun:test";

import type { Annotation } from "./feedback.ts";
import { decideOn, editOnLoad, gateVersion, slugFor } from "./review.ts";
import type { PlanWorkspace } from "./workspace.ts";

const DIR = "plans/2026-09-15/wip-4c2a9d93/" as never;

const V1 = 1 as never;

const drafting: PlanWorkspace = { kind: "drafting", dir: DIR, batches: 2 };

const inReview: PlanWorkspace = {
  kind: "inReview",
  dir: DIR,
  version: V1,
  batches: 0,
  finalizeError: null,
};

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

const PLAN = "# P\n";

const inReviewAt2: PlanWorkspace = { ...inReview, version: 2 as never };

const GLOBAL = { kind: "global" } as const;

const NO = { kind: "comment", body: "No." } as const;

const EDITED_FEEDBACK = {
  kind: "feedback",
  edit: { version: V1, text: "# Q\n" },
  annotations: [],
} as const;

const Q_OF_V2 = { version: 2 as never, text: "# Q\n" } as const;

function at(doc: string): Annotation {
  return { id: "a", doc: doc as never, anchor: GLOBAL, mark: NO };
}

const APPROVE = { kind: "approve", edit: null } as const;

describe("decideOn", () => {
  test("approve names the version to finalize", () => {
    expect(decideOn(inReview, PLAN, APPROVE)).toEqual({ kind: "approve", version: V1, edit: null });
  });

  test("feedback names the file to write", () => {
    expect(decideOn(inReview, PLAN, { kind: "feedback", edit: null, annotations: [] })).toEqual({
      kind: "feedback",
      version: V1,
      edit: null,
      path: `${DIR}.review/v1.feedback.md` as never,
      editedFrom: null,
      annotations: [],
    });
  });

  test("a feedback while drafting is the next batch", () => {
    expect(decideOn(drafting, null, { kind: "feedback", edit: null, annotations: [] })).toEqual({
      kind: "draftFeedback",
      batch: 3,
      path: `${DIR}.review/v0.feedback-3.md` as never,
    });
  });

  test("approve with an edit is the next version, and names the version file to write", () => {
    expect(
      decideOn(inReview, PLAN, { kind: "approve", edit: { version: V1, text: "# Q\n" } }),
    ).toEqual({
      kind: "approve",
      version: 2 as never,
      edit: { path: `${DIR}.review/v2.md` as never, text: "# Q\n" },
    });
  });

  test("an edit equal to the version's text is no edit", () => {
    expect(
      decideOn(inReview, PLAN, { kind: "approve", edit: { version: V1, text: PLAN } }),
    ).toEqual({
      kind: "approve",
      version: V1,
      edit: null,
    });
  });

  test("a drafting feedback with an edit is refused", () => {
    expect(decideOn(drafting, null, EDITED_FEEDBACK)).toEqual({ kind: "refused" });
  });

  test("feedback with an edit retargets the plan's annotation to the new version, not an artifact's", () => {
    const annotations = [at(`${DIR}.review/v2.md`), at(`${DIR}notes.md`)];
    const decided = decideOn(inReviewAt2, PLAN, { kind: "feedback", edit: Q_OF_V2, annotations });

    expect(decided).toMatchObject({
      version: 3,
      editedFrom: 2,
      path: `${DIR}.review/v3.feedback.md`,
      annotations: [at(`${DIR}.review/v3.md`), at(`${DIR}notes.md`)],
    });
  });

  test("an edit of another version than the one under review is refused", () => {
    expect(decideOn(inReview, PLAN, { kind: "approve", edit: Q_OF_V2 })).toEqual({
      kind: "refused",
    });
  });

  test.each([changesRequested, approved])(
    "a feedback with an edit is refused on $kind",
    (workspace) => {
      expect(decideOn(workspace, PLAN, EDITED_FEEDBACK)).toEqual({ kind: "refused" });
    },
  );

  test.each([drafting, changesRequested, approved])("approve is refused on $kind", (workspace) => {
    expect(decideOn(workspace, PLAN, APPROVE)).toEqual({ kind: "refused" });
  });
});

describe("editOnLoad", () => {
  const edit = { version: 2 as never, text: "# Q\n" } as const;

  test("the same version loaded again leaves the edit pending", () => {
    expect(editOnLoad(edit, { version: 2 as never, text: PLAN })).toBe("pending");
  });

  test("the next version holding the edit's own text is the edit, landed", () => {
    expect(editOnLoad(edit, { version: 3 as never, text: "# Q\n" })).toBe("landed");
  });

  test("the next version with another text, or a later one, makes the edit stale", () => {
    expect(editOnLoad(edit, { version: 3 as never, text: PLAN })).toBe("stale");
    expect(editOnLoad(edit, { version: 4 as never, text: "# Q\n" })).toBe("stale");
  });
});

describe("slugFor", () => {
  test("the title first, the plan file's name without one", () => {
    expect(slugFor("# Notes\n")).toEqual({ ok: true, value: "notes" as never });
    expect(slugFor("no heading")).toEqual({ ok: true, value: "plan" as never });
  });
});
