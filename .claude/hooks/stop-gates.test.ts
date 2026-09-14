import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { markerPath, parseStopInput, skipsGates } from "./stop-gates.ts";

const SESSION_ID = "0244f1e4-d3aa-44b3-8919-3fe7b1e82701";

describe("parseStopInput", () => {
  test("reads the fields the hook acts on", () => {
    const input = parseStopInput(
      JSON.stringify({
        session_id: SESSION_ID,
        permission_mode: "default",
        background_tasks: [{ id: "task-001", type: "shell", status: "running" }],
      }),
    );

    expect(input?.session_id).toBe(SESSION_ID);
    expect(input?.permission_mode).toBe("default");
    expect(input?.background_tasks?.[0]?.type).toBe("shell");
  });

  test("returns null on invalid JSON", () => {
    expect(parseStopInput("not json")).toBeNull();
  });
});

describe("skipsGates", () => {
  test("skips in plan mode", () => {
    expect(skipsGates({ permission_mode: "plan", background_tasks: [] })).toBe(true);
  });

  test("skips while a subagent, a workflow or a teammate runs in the background", () => {
    for (const type of ["subagent", "workflow", "teammate"]) {
      expect(skipsGates({ permission_mode: "default", background_tasks: [{ type }] })).toBe(true);
    }
  });

  test("runs beside background tasks that do not edit", () => {
    const tasks = [{ type: "shell" }, { type: "monitor" }];

    expect(skipsGates({ permission_mode: "default", background_tasks: tasks })).toBe(false);
  });

  test("runs when the payload lists no background task", () => {
    expect(skipsGates({ permission_mode: "acceptEdits" })).toBe(false);
  });
});

describe("markerPath", () => {
  test("names one file per session under the temp directory", () => {
    expect(markerPath(SESSION_ID)).toBe(join(tmpdir(), "claude-code-plugins-stop", SESSION_ID));
  });

  test("refuses an id that is not a single path segment", () => {
    for (const id of ["", "..", "../etc", "a/b", "a b"]) {
      expect(markerPath(id)).toBeNull();
    }
  });
});
