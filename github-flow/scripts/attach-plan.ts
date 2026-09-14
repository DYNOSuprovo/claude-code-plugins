#!/usr/bin/env bun

/** Runs on every Bash call, so the command check comes before any subprocess. */

import { homedir } from "node:os";

import {
  isPrCreate,
  parsePayload,
  planKeyFor,
  planPath,
  prHeadBranch,
  prNumberFrom,
  upsertPlanComment,
} from "./plan-comment.ts";

if (import.meta.main) {
  try {
    const payload = parsePayload(await Bun.stdin.text());

    if (payload === null) process.exit(0);

    if (!isPrCreate(payload.tool_input?.command ?? "")) process.exit(0);

    const pr = prNumberFrom(JSON.stringify(payload.tool_response ?? ""));

    if (pr === null) process.exit(0);

    // The session cwd may sit on another branch than the checkout `gh pr create` ran in.
    const cwd = payload.cwd ?? process.cwd();
    const branch = await prHeadBranch(cwd, pr);

    if (branch === null) process.exit(0);
    const key = await planKeyFor(cwd, branch);

    if (key === null) process.exit(0);

    const plan = Bun.file(planPath(homedir(), key));

    if (!(await plan.exists())) process.exit(0);

    await upsertPlanComment(cwd, pr, await plan.text());
  } catch (error) {
    console.error(`attach-plan: ${error instanceof Error ? error.message : String(error)}`);
  }

  process.exit(0);
}
