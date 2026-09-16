/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures and expectations here are branded values (Version, ProjectPath, WipDir) written as literals: the brand is the parser's to grant, and the test is what checks the parser. */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serverPlugins } from "../../plugins/server.ts";
import { parseWipDir } from "../domain/paths.ts";
import { Review } from "./review.ts";

/** The applying side: the pure decisions are covered in `src/domain/review.test.ts`. */

const WIP = "plans/2026-09-15/wip-4c2a9d93/";

const DATED = "plans/2026-09-15";

const PLAN = `# Notification settings\n\nSee [mockup](${WIP}mockup.html) and [missing](${WIP}nope.html).\n`;

const FINAL = "plans/2026-09-15/notification-settings/";

const V1 = 1 as never;

type Setup = { readonly review: Review; readonly root: string };

function setup(): Setup {
  const root = mkdtempSync(join(tmpdir(), "vellum-review-"));
  mkdirSync(join(root, WIP, ".review"), { recursive: true });
  writeFileSync(join(root, WIP, "mockup.html"), "<p>hi</p>");
  const workdir = parseWipDir(WIP);

  if (!workdir.ok) throw new Error(workdir.error);

  return {
    review: new Review({ project: root, workdir: workdir.value, plugins: serverPlugins }),
    root,
  };
}

/** A review whose `plan.md` holds `plan` and was gated as v1. */
async function gated(plan = PLAN): Promise<Setup> {
  const s = setup();
  writeFileSync(join(s.root, WIP, "plan.md"), plan);
  await s.review.gate();

  return s;
}

const GENERAL_NO = {
  id: "a",
  doc: `${WIP}.review/v1.md` as never,
  anchor: { kind: "global" },
  body: "No.",
} as const;

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Review", () => {
  test("gate without plan.md answers the error the model reads", async () => {
    const { review } = setup();
    expect(await review.gate()).toEqual({ ok: false, error: `write plan.md in ${WIP} first` });
  });

  test("gate writes vN.md from plan.md and answers the version", async () => {
    const { review, root } = await gated();
    expect(read(root, `${WIP}.review/v1.md`)).toBe(PLAN);
    writeFileSync(join(root, WIP, "plan.md"), `${PLAN}more\n`);
    expect(await review.gate()).toEqual({ ok: true, version: 2 as never, kept: false });
    expect(read(root, `${WIP}.review/v2.md`)).toBe(`${PLAN}more\n`);
  });

  test("the same plan.md keeps its version under review, and reopens it after a feedback", async () => {
    const { review } = await gated();
    expect(await review.gate()).toEqual({ ok: true, version: V1, kept: true });
    await review.decide({ kind: "feedback", annotations: [] });
    expect(await review.gate()).toEqual({ ok: true, version: 2 as never, kept: false });
    expect(await review.workspace()).toMatchObject({ kind: "inReview", version: 2 });
  });

  test("feedback writes the file the pending names, and the version is decided", async () => {
    const { review, root } = await gated();
    const first = await review.decide({ kind: "feedback", annotations: [GENERAL_NO] });
    expect(first).toMatchObject({ ok: true, workspace: { kind: "changesRequested" } });
    const path = `${WIP}.review/v1.feedback.md` as never;
    expect(await review.pending()).toEqual({ kind: "feedback", version: V1, path });
    expect(read(root, `${WIP}.review/v1.feedback.md`)).toContain("No.");
    expect((await review.decide({ kind: "approve" })).ok).toBe(false);
  });

  test("approve renames the directory at once and leaves it pending with its name", async () => {
    const { review, root } = await gated();
    const result = await review.decide({ kind: "approve" });
    expect(result).toEqual({
      ok: true,
      workspace: { kind: "approved", dir: FINAL as never, version: V1 },
    });
    expect(read(root, `${FINAL}.review/v1.md`)).toContain(`${FINAL}mockup.html`);
    expect(await review.pending()).toEqual({ kind: "approved", version: V1, dir: FINAL as never });
  });

  test("approve puts the approved text back in plan.md, over a revision not submitted", async () => {
    const { review, root } = await gated();
    writeFileSync(join(root, WIP, "plan.md"), "# Notification settings\n\nrevised\n");
    await review.decide({ kind: "approve" });
    expect(read(root, `${FINAL}plan.md`)).toBe(read(root, `${FINAL}.review/v1.md`));
    expect(read(root, `${FINAL}plan.md`)).toContain(`${FINAL}mockup.html`);
  });

  test("a rename that fails shows its error and leaves the plan under review", async () => {
    const { review, root } = await gated();
    chmodSync(join(root, DATED), 0o500);
    const result = await review.decide({ kind: "approve" });
    chmodSync(join(root, DATED), 0o700);
    expect(result).toMatchObject({
      ok: false,
      workspace: { kind: "inReview", finalizeError: expect.any(String) },
    });
    expect(await review.pending()).toEqual({ kind: "none" });
  });

  test("view under review lists the files without the working copy of the plan", async () => {
    const { review } = await gated();
    const view = await review.view();
    expect(view.workspace.kind).toBe("inReview");
    expect(view.plan?.doc).toBe(`${WIP}.review/v1.md` as never);
    expect(view.docs).toEqual([
      { path: `${WIP}mockup.html` as never, mediaType: "text/html", modified: expect.any(Number) },
    ]);
  });

  test("view once approved lists the final directory's files, the plan's copy left out", async () => {
    const { review, root } = await gated();
    writeFileSync(join(root, WIP, "unlinked.md"), "# Unlinked\n");
    await review.decide({ kind: "approve" });
    const view = await review.view();
    expect(view.plan?.doc).toBe(`${FINAL}.review/v1.md` as never);
    expect(view.docs.map((doc) => doc.path)).toEqual([
      `${FINAL}mockup.html` as never,
      `${FINAL}unlinked.md` as never,
    ]);
  });

  test("view while drafting lists the renderable files, the draft plan included, without .review/", async () => {
    const { review, root } = setup();
    writeFileSync(join(root, WIP, ".review", "v0.feedback-1.md"), "# Drafting feedback 1\n");
    writeFileSync(join(root, WIP, "notes.bin"), "not renderable");
    writeFileSync(join(root, WIP, "plan.md"), "# Draft\n");
    mkdirSync(join(root, WIP, "sub"));
    writeFileSync(join(root, WIP, "sub", "a.md"), "# A\n");
    const view = await review.view();
    expect(view.plan).toBeNull();
    expect(view.docs.map((doc) => doc.path)).toEqual([
      `${WIP}mockup.html` as never,
      `${WIP}plan.md` as never,
      `${WIP}sub/a.md` as never,
    ]);
  });

  test("a batch sent just before the gate is still pending after it", async () => {
    const { review, root } = setup();
    await review.decide({ kind: "feedback", annotations: [GENERAL_NO] });
    writeFileSync(join(root, WIP, "plan.md"), PLAN);
    await review.gate();
    expect(await review.pending()).toEqual({
      kind: "drafts",
      batches: [{ batch: 1, path: `${WIP}.review/v0.feedback-1.md` as never }],
    });
  });

  test("a feedback while drafting writes the next batch and leaves it pending", async () => {
    const { review, root } = setup();
    const first = await review.decide({ kind: "feedback", annotations: [GENERAL_NO] });
    expect(first).toMatchObject({ ok: true, workspace: { kind: "drafting", batches: 1 } });
    expect(read(root, `${WIP}.review/v0.feedback-1.md`)).toStartWith("# Drafting feedback 1");
    await review.decide({ kind: "feedback", annotations: [GENERAL_NO] });
    expect(await review.pending()).toEqual({
      kind: "drafts",
      batches: [
        { batch: 1, path: `${WIP}.review/v0.feedback-1.md` as never },
        { batch: 2, path: `${WIP}.review/v0.feedback-2.md` as never },
      ],
    });
  });
});
