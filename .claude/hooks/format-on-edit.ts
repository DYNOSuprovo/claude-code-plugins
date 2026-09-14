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

import { join, relative as relativeTo } from "node:path";

import { $ } from "bun";

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

const OXFMT_EXTENSIONS = [".ts", ".js", ".mjs", ".cjs"] as const;

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
  const relative = relativeTo(repoRoot, filePath);

  return relative.startsWith("..") ? null : relative;
}

export function formatterFor(relativePath: string): Formatter | null {
  // Bun installs node_modules as hard links into its global cache, and oxfmt
  // formats a file named there: the rewrite would reach every project's copy.
  if (relativePath.split("/").includes("node_modules")) return null;

  if (OXFMT_EXTENSIONS.some((ext) => relativePath.endsWith(ext))) {
    // oxfmt reads a path its config ignores as an unmatched pattern; without
    // the flag it exits 2 there, the code it also gives a parse error.
    return {
      tool: "oxfmt",
      argv: ["bun", "x", "oxfmt", "--no-error-on-unmatched-pattern", relativePath],
    };
  }

  // archive/ is excluded as in scripts/lint-shell.ts.
  if (relativePath.endsWith(".sh") && !relativePath.startsWith("archive/")) {
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

if (import.meta.main) {
  const repoRoot = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const input = parseHookInput(await Bun.stdin.text());
  const filePath = input?.tool_input?.file_path;
  const relative = filePath === undefined ? null : toRepoRelative(filePath, repoRoot);

  if (relative === null) process.exit(HOOK_EXIT.ALLOW);

  const marker = input?.session_id === undefined ? null : markerPath(input.session_id);

  if (marker !== null) await Bun.write(marker, "");

  const formatter = formatterFor(relative);
  const absolute = join(repoRoot, relative);

  if (formatter === null || !(await Bun.file(absolute).exists())) process.exit(HOOK_EXIT.ALLOW);

  const before = await Bun.file(absolute).text();
  const run = await $`${formatter.argv}`.cwd(repoRoot).nothrow().quiet();

  if (run.exitCode !== 0) {
    const output = `${run.stdout.toString()}${run.stderr.toString()}`.trim();
    console.log(hookOutput(`\`${formatter.tool}\` failed on \`${relative}\`:\n${output}`));
    process.exit(HOOK_EXIT.ALLOW);
  }

  if ((await Bun.file(absolute).text()) === before) process.exit(HOOK_EXIT.ALLOW);

  // stdin carries mode 100644, so an executable file differs by mode alone:
  // the exit code cannot stand in for the content comparison above.
  const diff =
    await $`git diff --no-index --no-color --no-ext-diff - ${relative} < ${new Blob([before])}`
      .cwd(repoRoot)
      .nothrow()
      .quiet();

  if (diff.exitCode !== GIT_DIFF_FILES_DIFFER) {
    throw new Error(`git diff --no-index exited ${diff.exitCode}: ${diff.stderr.toString()}`);
  }

  const hunks = diffHunks(diff.stdout.toString());

  console.log(
    hookOutput(
      `\`${formatter.tool}\` reformatted \`${relative}\`; it now reads as this diff:\n${hunks}`,
    ),
  );
}
