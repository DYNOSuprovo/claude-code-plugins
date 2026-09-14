#!/usr/bin/env bun

/**
 * Run every gate of `EXPECTED_COMMANDS` as CI runs it, in parallel, from the
 * repo root. Silent when all pass; otherwise prints each failing gate with its
 * output and exits 1.
 */

import { join } from "node:path";

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
  const proc = Bun.spawn(["sh", "-c", command], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { gate, command, exitCode, output: `${stdout}${stderr}`.trim() };
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
