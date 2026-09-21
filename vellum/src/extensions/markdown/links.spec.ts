/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures and expectations are branded ProjectPath literals; the brand is the parser's to grant, and nothing here parses. */
import { describe, expect, test } from "bun:test";

import type { DocGroup, GroupedDoc } from "../../core/protocol.ts";
import { linkedDoc } from "./links.ts";

const WIP = "plans/2026-09-15/wip-4c2a9d93/";

const PLAN = { doc: `${WIP}.review/v2.md`, workingCopy: `${WIP}plan.md` } as never;

function doc(path: string, group: DocGroup = "artifact"): GroupedDoc {
  return { path, mediaType: "text/markdown", modified: 0, group } as never;
}

describe("linkedDoc", () => {
  test("a whole path names the document at it", () => {
    expect(linkedDoc(`${WIP}notes.md`, [doc(`${WIP}notes.md`)], PLAN)).toBe(
      `${WIP}notes.md` as never,
    );
  });

  test("a bare name names the document whose path ends on it", () => {
    expect(linkedDoc("notes.md", [doc(`${WIP}notes.md`)], PLAN)).toBe(`${WIP}notes.md` as never);
  });

  test("a name that ends no whole segment names nothing", () => {
    expect(linkedDoc("tes.md", [doc(`${WIP}notes.md`)], PLAN)).toBeNull();
  });

  test("the working copy's path names the version the reviewer reads", () => {
    expect(linkedDoc(`${WIP}plan.md`, [], PLAN)).toBe(`${WIP}.review/v2.md` as never);
  });

  test("the working copy's bare name names that version too", () => {
    expect(linkedDoc("plan.md", [], PLAN)).toBe(`${WIP}.review/v2.md` as never);
  });

  test("another directory's plan.md names nothing", () => {
    expect(linkedDoc("plans/2026-09-01/other/plan.md", [], PLAN)).toBeNull();
  });

  test("a listed document is preferred to the working copy", () => {
    const cited = doc("plans/2026-09-01/other/plan.md", "cited");
    expect(linkedDoc("plan.md", [cited], PLAN)).toBe("plans/2026-09-01/other/plan.md" as never);
  });

  test("while drafting the working copy is listed, and the link names it there", () => {
    expect(linkedDoc("plan.md", [doc(`${WIP}plan.md`, "plan")], null)).toBe(
      `${WIP}plan.md` as never,
    );
  });
});
