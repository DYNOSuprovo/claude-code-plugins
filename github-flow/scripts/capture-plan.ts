#!/usr/bin/env bun

/**
 * PreToolUse, not PostToolUse: the plan dialog's "Yes, clear context" options
 * resolve ExitPlanMode as a denial (CLI 2.1.270), and PostToolUse only runs
 * after a tool succeeds, so a plan approved that way would never be captured.
 * The cost is a file written for a plan the user then rejects, overwritten by
 * the next approval on that branch.
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import {
  openPrNumber,
  parsePayload,
  planKeyFor,
  planPath,
  planText,
  upsertPlanComment,
} from "./plan-comment.ts";

if (import.meta.main) {
  try {
    const payload = parsePayload(await Bun.stdin.text());
    if (payload === null) process.exit(0);
    const plan = planText(payload);
    if (plan === null) process.exit(0);

    const cwd = payload.cwd ?? process.cwd();
    const key = await planKeyFor(cwd);
    if (key === null) process.exit(0);

    const file = planPath(homedir(), key);
    await mkdir(dirname(file), { recursive: true });
    await Bun.write(file, plan.endsWith("\n") ? plan : `${plan}\n`);

    const pr = await openPrNumber(cwd);
    if (pr !== null) await upsertPlanComment(cwd, pr, plan);
  } catch (error) {
    console.error(`capture-plan: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(0);
}
