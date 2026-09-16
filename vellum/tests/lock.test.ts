import { describe, expect, test, tier } from "claude-code/testing";

import { lockVerdict, type Verdict } from "../hooks/lock.ts";
import { submitResult } from "../hooks/relay.ts";
import { CWD, WORKDIR } from "./fixtures/index.ts";

tier("user");

const DENIED = {
  kind: "deny",
  reason: `vellum is planning: files outside ${WORKDIR} change after the plan is approved`,
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- `input` is the call's arguments as `tool.check` hands them over, which is what `lockVerdict` takes.
const verdict = (tool: string, input: unknown, cwd: string = CWD): Verdict =>
  lockVerdict(tool, input, cwd, CWD, WORKDIR);

describe("lockVerdict", () => {
  test("a file under the working directory is allowed outright", () => {
    expect(verdict("Edit", { file_path: `${CWD}/${WORKDIR}mockup.html` })).toEqual({
      kind: "allow",
    });
  });

  test("a file outside it is denied, with the reason the model reads", () => {
    expect(verdict("Write", { file_path: `${CWD}/src/cli.ts` })).toEqual(DENIED);
  });

  test("a relative path is resolved against the session's directory", () => {
    expect(verdict("Edit", { file_path: `${WORKDIR}notes.md` })).toEqual({ kind: "allow" });
    expect(verdict("Edit", { file_path: `${WORKDIR}../escape.md` })).toEqual(DENIED);
  });

  test("the working directory hangs off the project root, wherever the session cd-ed", () => {
    const inside = `${CWD}/${WORKDIR}`;
    expect(verdict("Edit", { file_path: `${inside}plan.md` }, inside)).toEqual({ kind: "allow" });
    expect(verdict("Edit", { file_path: "plan.md" }, inside)).toEqual({ kind: "allow" });
    expect(verdict("Edit", { file_path: "../../../src/cli.ts" }, inside)).toEqual(DENIED);
  });

  test("NotebookEdit is read on notebook_path", () => {
    expect(verdict("NotebookEdit", { notebook_path: "src/n.ipynb" })).toEqual(DENIED);
  });

  test("a tool that writes no file is the session's to decide", () => {
    for (const tool of ["Bash", "Read", "mcp__other__write"]) {
      expect(verdict(tool, { command: "rm -rf /" }), tool).toEqual({ kind: "check" });
    }
  });
});

describe("submitResult", () => {
  test("a recorded version tells the model to end its turn", () => {
    expect(submitResult({ version: 1, kept: false })).toEqual({
      result:
        "Plan v1 is under review in the browser. End your turn; the review arrives as a prompt.",
    });
  });

  test("a kept version says the plan is already under review", () => {
    expect(submitResult({ version: 2, kept: true })).toEqual({
      result:
        "Plan v2 is already under review in the browser. End your turn; the review arrives as a prompt.",
    });
  });

  test("an error is the deny the model reads", () => {
    expect(submitResult({ error: "write plan.md in x/ first" })).toEqual({
      deny: "write plan.md in x/ first",
    });
  });
});
