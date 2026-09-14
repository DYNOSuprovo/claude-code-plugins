#!/usr/bin/env bun

/**
 * Run every gate of `EXPECTED_COMMANDS` as CI runs it, in parallel, from the
 * repo root. Silent when all pass; otherwise prints each failing gate with its
 * output and exits 1.
 */

import { join } from "node:path";

import { $ } from "bun";

import { EXPECTED_COMMANDS } from "./check-lint-config.ts";

export interface GateResult {
  gate: string;
  command: string;
  exitCode: number;
  output: string;
}

export function failureReport(results: GateResult[]): string {
  return results
    .flatMap((result) =>
      result.exitCode === 0 ? [] : [`${result.gate}: ${result.command}\n${result.output}`],
    )
    .join("\n\n");
}

async function runGate(repoRoot: string, gate: string, command: string): Promise<GateResult> {
  const result = await $`sh -c ${command}`.cwd(repoRoot).nothrow().quiet();
  const output = `${result.stdout.toString()}${result.stderr.toString()}`.trim();

  return { gate, command, exitCode: result.exitCode, output };
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dir, "..");

  const results = await Promise.all(
    EXPECTED_COMMANDS.map((pair) => runGate(repoRoot, pair.gate, pair.ci)),
  );

  const report = failureReport(results);

  if (report !== "") {
    console.error(report);
    process.exit(1);
  }
}
