import { describe, expect, test, tier } from "claude-code/testing";

import { approved, CWD, DIR, FINAL, link, START_PROMPT, WORKDIR, world } from "./fixtures/index.ts";
import { type Landed, lockVerdict } from "./lock.ts";
import { editedPath, parsePending } from "./parse.ts";
import { submitResult } from "./relay.ts";

tier("user");

const DENIED = {
  kind: "deny",
  reason: `vellum is planning: files outside ${WORKDIR} change after the plan is approved`,
};

const DENIAL = { decision: "deny", reason: DENIED.reason };

const ENGINE = { decision: "ask", reason: "the session's own flow" } as const;

const INSIDE = `${CWD}/${WORKDIR}`;

function landedOn(file: string | null, at: Partial<Landed> = {}): Landed {
  return { file, project: CWD, workdir: INSIDE.slice(0, -1), ...at };
}

describe("lockVerdict", () => {
  test("a file that lands under the working directory is allowed outright", () => {
    expect(lockVerdict("x", WORKDIR, landedOn(`${INSIDE}mockup.html`))).toEqual({ kind: "allow" });
  });

  test("a file that lands under the project and outside the working directory is denied", () => {
    expect(lockVerdict("x", WORKDIR, landedOn(`${CWD}/src/cli.ts`))).toEqual(DENIED);
  });

  test("a file that lands outside the project is the session's to decide", () => {
    const scratchpad = "/tmp/claude-1000/project/session/scratchpad/issue.md";
    expect(lockVerdict("x", WORKDIR, landedOn(scratchpad))).toEqual({ kind: "check" });
  });

  test("a directory whose name only starts as the project's is outside it", () => {
    expect(lockVerdict("x", WORKDIR, landedOn(`${CWD}-old/src/cli.ts`))).toEqual({ kind: "check" });
    expect(lockVerdict("x", WORKDIR, landedOn(`${INSIDE.slice(0, -1)}-old/plan.md`))).toEqual(
      DENIED,
    );
  });

  test("a project at the root of the file system still holds the lock", () => {
    expect(lockVerdict("x", WORKDIR, landedOn("/etc/hosts", { project: "/" }))).toEqual(DENIED);
  });

  test("a file that lands nowhere known is denied, and the reason names it as written", () => {
    expect(lockVerdict("\\\\host\\share\\x.md", WORKDIR, landedOn(null))).toEqual({
      kind: "deny",
      reason:
        "vellum is planning and cannot tell where \\\\host\\share\\x.md lands; name the file by its full path",
    });
  });

  test("a working directory that lands nowhere allows nothing", () => {
    expect(lockVerdict("x", WORKDIR, landedOn(`${INSIDE}plan.md`, { workdir: null }))).toEqual(
      DENIED,
    );
  });

  test("another case does not take a file out of the project: NTFS and APFS fold it", () => {
    expect(lockVerdict("x", WORKDIR, landedOn("/PROJECT/src/cli.ts"))).toEqual(DENIED);
  });

  test("another case of the working directory is not the working directory", () => {
    expect(lockVerdict("x", WORKDIR, landedOn(`${INSIDE.toUpperCase()}plan.md`))).toEqual(DENIED);
  });
});

describe("lockVerdict on what a Windows disk answers", () => {
  const windows = {
    project: "C:\\work\\proj",
    workdir: `C:\\work\\proj\\${WORKDIR.replaceAll("/", "\\").slice(0, -1)}`,
  };

  function win(file: string): ReturnType<typeof lockVerdict> {
    return lockVerdict("x", WORKDIR, landedOn(file, windows));
  }

  test("a file under the working directory is allowed outright", () => {
    expect(win(`${windows.workdir}\\plan.md`)).toEqual({ kind: "allow" });
  });

  test("a file not written yet, its tail joined with `/`, is the same file", () => {
    expect(win(`${windows.workdir}/mockups/a.html`)).toEqual({ kind: "allow" });
    expect(win("C:\\work\\proj/src/new.ts")).toEqual(DENIED);
  });

  test("a file under the project and outside the working directory is denied, in any case", () => {
    expect(win("C:\\work\\proj\\src\\cli.ts")).toEqual(DENIED);
    expect(win("c:\\WORK\\PROJ\\src\\cli.ts")).toEqual(DENIED);
  });

  test("a file on the project's drive, on another or on a share is the session's to decide", () => {
    for (const file of ["C:\\Temp\\x.md", "C:\\work\\proj2\\x.md", "D:\\work\\proj\\x.md"]) {
      expect(win(file), file).toEqual({ kind: "check" });
    }
  });

  test("a project at the root of a drive holds the whole drive", () => {
    expect(lockVerdict("x", WORKDIR, landedOn("C:\\src\\cli.ts", { project: "C:\\" }))).toEqual(
      DENIED,
    );
  });
});

describe("the lock places a path before it decides", () => {
  test("a file not written yet lands under the first of its folders that exists", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `${INSIDE}mockups/v2/a.html` } }),
    ).toEqual({ decision: "allow" });

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `${CWD}/docs/new/page.md` } }),
    ).toEqual(DENIAL);
  });

  test("a link in the working directory that leads into the project is the project", async ($, on) => {
    world(on, { disk: new Map([[`${INSIDE}link`, link("../../../src")]]) });
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    for (const file_path of [`${INSIDE}link/cli.ts`, `${INSIDE}link/new.ts`]) {
      expect(await $.tool.check({ tool: "Edit", input: { file_path } }), file_path).toEqual(DENIAL);
    }
  });

  test("a link that leads out of the project is the session's to decide", async ($, on) => {
    world(on, {
      disk: new Map([
        [`${INSIDE}out`, link("/tmp")],
        ["/tmp", DIR],
      ]),
    });
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `${INSIDE}out/x.md` } }),
    ).toEqual(ENGINE);
  });

  test("a project reached through a link is still the project", async ($, on) => {
    world(on, { disk: new Map([["/alias", link(CWD)]]) });
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: "/alias/src/cli.ts" } }),
    ).toEqual(DENIAL);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `/alias/${WORKDIR}plan.md` } }),
    ).toEqual({ decision: "allow" });
  });

  test("a link that leads nowhere is denied: the tool would write where it points", async ($, on) => {
    world(on, { disk: new Map([[`${INSIDE}dangling`, link("../../../src/new.ts")]]) });
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `${INSIDE}dangling` } }),
    ).toMatchObject({ decision: "deny", reason: expect.stringContaining("cannot tell where") });
  });

  test("a spelling Windows reads as a drive, and a path no folder of which answers, are denied", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    for (const file_path of ["D:plan.md", `${INSIDE}C:stream`, "//host/share/x.md"]) {
      expect(await $.tool.check({ tool: "Write", input: { file_path } }), file_path).toMatchObject({
        decision: "deny",
        reason: expect.stringContaining("cannot tell where"),
      });
    }
  });

  test("a relative path hangs off the session's directory", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    expect(
      await $.tool.check({ tool: "Edit", input: { file_path: `${WORKDIR}notes.md` } }),
    ).toEqual({ decision: "allow" });

    expect(
      await $.tool.check({ tool: "Edit", input: { file_path: `${WORKDIR}../escape.md` } }),
    ).toEqual(DENIAL);
  });

  test("NotebookEdit is read on notebook_path, and a tool that writes no file passes on", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(START_PROMPT);

    expect(
      await $.tool.check({ tool: "NotebookEdit", input: { notebook_path: "src/n.ipynb" } }),
    ).toEqual(DENIAL);

    expect(editedPath("Bash", { command: "rm -rf /" })).toBeNull();
  });
});

describe("submitResult", () => {
  test("a version tells the model to end its turn, recorded or kept: it acts the same on both", () => {
    expect(submitResult({ version: 1, kept: false })).toEqual({
      result: "Plan v1 under review. End your turn.",
    });
    expect(submitResult({ version: 2, kept: true })).toEqual({
      result: "Plan v2 under review. End your turn.",
    });
  });

  test("an error is the deny the model reads", () => {
    expect(submitResult({ error: "write plan.md in x/ first" })).toEqual({
      deny: "write plan.md in x/ first",
    });
  });
});

describe("parsePending", () => {
  test("an approval's notes are a path or null", () => {
    const notes = `${FINAL}.review/v3.notes.md`;

    expect(parsePending(JSON.stringify(approved(3, notes)))).toEqual(approved(3, notes));
    expect(parsePending(JSON.stringify(approved(3)))).toEqual(approved(3));
  });

  test("an approval whose notes are missing or no string is nothing to relay", () => {
    const { notes: _, ...bare } = approved(3);

    expect(parsePending(JSON.stringify(bare))).toEqual({ kind: "none" });
    expect(parsePending(JSON.stringify({ ...bare, notes: 3 }))).toEqual({ kind: "none" });
  });
});
