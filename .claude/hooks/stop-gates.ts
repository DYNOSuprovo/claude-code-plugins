#!/usr/bin/env bun

/**
 * Stop hook — runs every CI gate at the end of a turn that edited the repo, and
 * blocks the stop while one is red.
 *
 * `format-on-edit.ts` marks the session on each in-repo edit. A green run
 * clears the mark; a red one keeps it, so every later Stop checks again.
 * Skipped in plan mode, where a block loops through ExitPlanMode, and while a
 * subagent, workflow or teammate runs in the background: it may still be
 * editing.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

import { HOOK_EXIT } from "./guard-destructive.ts";

export interface StopInput {
  session_id?: string;
  permission_mode?: string;
  background_tasks?: { type?: string }[];
}

const GATES_COMMAND = ["bun", "./scripts/run-gates.ts"];

const EDITING_TASK_TYPES = new Set(["subagent", "workflow", "teammate"]);

export function parseStopInput(raw: string): StopInput | null {
  try {
    // SAFETY: every field of StopInput is optional, so a payload of another
    // shape reads back as absent fields and the stop proceeds.
    return JSON.parse(raw) as StopInput;
  } catch {
    return null;
  }
}

/** Null for an id that is not a single, safe path segment. */
export function markerPath(sessionId: string): string | null {
  return /^[\w-]+$/u.test(sessionId) ? join(tmpdir(), "claude-code-plugins-stop", sessionId) : null;
}

export function skipsGates(input: StopInput): boolean {
  if (input.permission_mode === "plan") return true;

  return (input.background_tasks ?? []).some((task) => EDITING_TASK_TYPES.has(task.type ?? ""));
}

if (import.meta.main) {
  const input = parseStopInput(await Bun.stdin.text());
  const marker = input?.session_id === undefined ? null : markerPath(input.session_id);

  if (input === null || marker === null || skipsGates(input)) process.exit(HOOK_EXIT.ALLOW);

  if (!(await Bun.file(marker).exists())) process.exit(HOOK_EXIT.ALLOW);

  const proc = Bun.spawn(GATES_COMMAND, {
    cwd: process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    console.error(`\`${GATES_COMMAND.join(" ")}\` is red; fix it before ending the turn.`);
    console.error(`${stdout}${stderr}`.trim());
    process.exit(HOOK_EXIT.BLOCK);
  }

  await Bun.file(marker).delete();
}
