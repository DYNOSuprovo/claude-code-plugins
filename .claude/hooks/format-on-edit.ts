#!/usr/bin/env bun

/**
 * PostToolUse hook for Edit|Write — formats the edited file with oxfmt or
 * shfmt, and marks the session for `stop-gates.ts`. Never blocks: lint, types
 * and the other gates wait for the end of the turn.
 *
 * A reformat reaches the agent as its diff in `additionalContext`. Claude Code
 * renders a Write or Edit result from the file path alone, so this is the one
 * channel that puts the formatted code in front of the next edit. A formatter
 * failure, a syntax error nearly every time, rides the same channel.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { HOOK_EXIT } from "./guard-destructive.ts";
import { markerPath } from "./stop-gates.ts";

export interface HookInput {
  session_id?: string;
  tool_input?: {
    file_path?: string;
  };
}

export interface Formatter {
  tool: "oxfmt" | "shfmt";
  argv: string[];
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const OXFMT_EXTENSIONS = [".ts", ".js", ".mjs", ".cjs"] as const;

// Mirrors ignorePatterns in .oxfmtrc.json: oxfmt exits 2 on an ignored path,
// the same code as a parse error.
const SKIPPED_PREFIXES = ["archive/", "node_modules/", "tools/oxlint/anti-slop/"] as const;

// Mirrors SHFMT_FLAGS in scripts/lint-shell.ts.
const SHFMT_FLAGS = ["-i", "2", "-ci"] as const;

const GIT_DIFF_FILES_DIFFER = 1;

export function parseHookInput(raw: string): HookInput | null {
  try {
    // SAFETY: every field of HookInput is optional, so a payload of another
    // shape reads back as absent fields and the hook does nothing.
    return JSON.parse(raw) as HookInput;
  } catch {
    return null;
  }
}

/** Repo-relative path, or null when the file sits outside the repo. */
export function toRepoRelative(filePath: string, repoRoot: string): string | null {
  if (!filePath.startsWith("/")) return filePath;
  const prefix = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;

  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : null;
}

export function formatterFor(relativePath: string): Formatter | null {
  if (SKIPPED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) return null;

  if (OXFMT_EXTENSIONS.some((ext) => relativePath.endsWith(ext))) {
    return { tool: "oxfmt", argv: ["bun", "x", "oxfmt", relativePath] };
  }

  if (relativePath.endsWith(".sh")) {
    return { tool: "shfmt", argv: ["shfmt", ...SHFMT_FLAGS, "-w", relativePath] };
  }

  return null;
}

/** The hunks of a `git diff`, without the header lines that name the compared files. */
export function diffHunks(diff: string): string {
  const lines = diff.trimEnd().split("\n");
  const firstHunk = lines.findIndex((line) => line.startsWith("@@"));

  return firstHunk === -1 ? "" : lines.slice(firstHunk).join("\n");
}

export function hookOutput(additionalContext: string): string {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
  });
}

async function runInRepo(repoRoot: string, argv: string[]): Promise<RunResult> {
  const proc = Bun.spawn(argv, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

async function formattingDiff(repoRoot: string, relative: string, before: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "format-on-edit-"));
  const beforePath = join(tempDir, basename(relative));
  await Bun.write(beforePath, before);

  const diff = await runInRepo(repoRoot, [
    "git",
    "diff",
    "--no-index",
    "--no-color",
    beforePath,
    relative,
  ]);

  await rm(tempDir, { recursive: true });

  if (diff.exitCode !== GIT_DIFF_FILES_DIFFER) {
    throw new Error(`git diff --no-index exited ${diff.exitCode}: ${diff.stderr}`);
  }

  return diffHunks(diff.stdout);
}

if (import.meta.main) {
  const repoRoot = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const input = parseHookInput(await Bun.stdin.text());
  const filePath = input?.tool_input?.file_path;
  const relative = filePath === undefined ? null : toRepoRelative(filePath, repoRoot);

  if (relative === null) process.exit(HOOK_EXIT.ALLOW);

  const marker = input?.session_id === undefined ? null : markerPath(input.session_id);

  if (marker !== null) await Bun.write(marker, "");

  const formatter = formatterFor(relative);

  if (formatter === null) process.exit(HOOK_EXIT.ALLOW);

  const absolute = join(repoRoot, relative);
  const before = await Bun.file(absolute).text();
  const run = await runInRepo(repoRoot, formatter.argv);

  if (run.exitCode !== 0) {
    const output = `${run.stdout}${run.stderr}`.trim();
    console.log(hookOutput(`\`${formatter.tool}\` failed on \`${relative}\`:\n${output}`));
  } else if ((await Bun.file(absolute).text()) !== before) {
    const hunks = await formattingDiff(repoRoot, relative, before);

    console.log(
      hookOutput(
        `\`${formatter.tool}\` reformatted \`${relative}\`; it now reads as this diff:\n${hunks}`,
      ),
    );
  }
}
