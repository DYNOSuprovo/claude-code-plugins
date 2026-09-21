import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { ReviewView } from "../protocol.ts";
import { parseWipDir } from "./domain/paths.ts";
import { discard, scratchDir, scratchId, stage, today } from "./preview.ts";

const PREVIEW = join(import.meta.dir, "preview.ts");

const DIR = scratchDir("2026-09-15", "4c2a9d93");

type Fixture = { readonly project: string; readonly source: string };

function fixture(): Fixture {
  const project = mkdtempSync(join(tmpdir(), "vellum-preview-"));
  const source = join(project, "approved");
  mkdirSync(join(source, ".review"), { recursive: true });
  mkdirSync(join(source, "shots"), { recursive: true });
  writeFileSync(join(source, "plan.md"), "# Plan\n");
  writeFileSync(join(source, "shots/mockup.html"), "<h1>Mockup</h1>\n");
  writeFileSync(join(source, ".review/v1.md"), "# Plan\n");

  return { project, source };
}

/** The URL the command prints, read before it has said anything else. */
async function firstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (!buffered.includes("\n")) {
    const { value, done } = await reader.read();

    if (done) break;
    buffered += decoder.decode(value);
  }

  reader.releaseLock();

  return buffered.split("\n")[0] ?? "";
}

async function viewOf(url: string): Promise<ReviewView> {
  const token = url.split("/t/")[1]?.replace("/", "") ?? "";

  const answer = await fetch(`${new URL(url).origin}/api/review`, {
    headers: { "x-vellum-token": token },
  });

  // SAFETY: `GET /api/review` answers `Response.json(await review.view())`, a `ReviewView`.
  return (await answer.json()) as ReviewView;
}

describe("the scratch directory", () => {
  test("is the one shape serve accepts, and a fresh one every time", () => {
    expect<string>(DIR).toBe("plans/2026-09-15/wip-4c2a9d93/");
    expect(parseWipDir(scratchDir(today(), scratchId())).ok).toBe(true);
    expect(scratchId()).not.toBe(scratchId());
  });

  test("an id that is not eight hex fails where it is built, not where it is served", () => {
    expect(() => scratchDir("2026-09-15", "not-hex!")).toThrow("not a working directory");
  });
});

describe("the copy", () => {
  test("carries the documents and the review's versions, and leaves the source alone", () => {
    const { project, source } = fixture();
    stage(source, project, DIR);
    writeFileSync(join(project, DIR, ".review/draft.json"), "{}");

    expect(readdirSync(join(project, DIR)).toSorted()).toEqual([".review", "plan.md", "shots"]);
    expect(existsSync(join(project, DIR, "shots/mockup.html"))).toBe(true);
    expect(existsSync(join(project, DIR, ".review/v1.md"))).toBe(true);
    expect(readdirSync(join(source, ".review"))).toEqual(["v1.md"]);
  });

  test("is discarded whole, with the dates it was the only plan of", () => {
    const { project, source } = fixture();
    stage(source, project, DIR);
    writeFileSync(join(project, DIR, ".review/draft.json"), "{}");
    discard(project, DIR);

    expect(existsSync(join(project, "plans"))).toBe(false);
    expect(existsSync(source)).toBe(true);
  });

  test("leaves a date another plan lives under", () => {
    const { project, source } = fixture();
    mkdirSync(join(project, "plans/2026-09-15/kept"), { recursive: true });
    stage(source, project, DIR);
    discard(project, DIR);

    expect(readdirSync(join(project, "plans/2026-09-15"))).toEqual(["kept"]);
  });
});

describe("the command", () => {
  test("serves a directory that is no working one, and takes its copy away on SIGINT", async () => {
    const { project, source } = fixture();
    const preview = Bun.spawn(["bun", PREVIEW, source], { cwd: project, stderr: "ignore" });
    const url = await firstLine(preview.stdout);
    const view = await viewOf(url);

    expect((await fetch(url)).status).toBe(200);
    expect(view.plan?.text).toBe("# Plan\n");
    expect(view.docs.map((doc) => basename(doc.path))).toEqual(["mockup.html"]);
    preview.kill("SIGINT");
    await preview.exited;

    expect(existsSync(join(project, "plans"))).toBe(false);
  });

  test("refuses a directory that holds no plan.md, and stages nothing", async () => {
    const { project } = fixture();
    const preview = Bun.spawn(["bun", PREVIEW, project], { cwd: project, stderr: "pipe" });

    expect(await preview.exited).toBe(2);
    expect(await new Response(preview.stderr).text()).toContain("plan.md");
    expect(existsSync(join(project, "plans"))).toBe(false);
  });
});
