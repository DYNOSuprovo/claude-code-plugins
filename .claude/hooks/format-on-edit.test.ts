import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { diffHunks, formatterFor, parseHookInput, toRepoRelative } from "./format-on-edit.ts";

describe("parseHookInput", () => {
  test("returns null on invalid JSON", () => {
    expect(parseHookInput("not json")).toBeNull();
  });
});

describe("toRepoRelative", () => {
  test("strips the repo root", () => {
    expect(toRepoRelative("/repo/scripts/a.ts", "/repo/")).toBe("scripts/a.ts");
  });

  test("returns null for a file outside the repo", () => {
    expect(toRepoRelative("/elsewhere/a.ts", "/repo")).toBeNull();
  });
});

describe("formatterFor", () => {
  test("sends the four script extensions to oxfmt, which skips what its config ignores", () => {
    for (const path of ["a.ts", "a.js", "a.mjs", "a.cjs", "archive/plugin/a.ts"]) {
      expect(formatterFor(path)).toEqual({
        tool: "oxfmt",
        argv: ["bun", "x", "oxfmt", "--no-error-on-unmatched-pattern", path],
      });
    }
  });

  test("sends shell scripts to shfmt with the lint-shell flags", () => {
    expect(formatterFor("scripts/a.sh")).toEqual({
      tool: "shfmt",
      argv: ["shfmt", "-i", "2", "-ci", "-w", "scripts/a.sh"],
    });
  });

  test("has none for other files", () => {
    for (const path of ["a.md", "a.json", "a"]) {
      expect(formatterFor(path)).toBeNull();
    }
  });

  test("skips shell scripts under archive/, as lint-shell does", () => {
    expect(formatterFor("archive/plugin/a.sh")).toBeNull();
  });

  test("skips every file under a node_modules directory", () => {
    for (const path of [
      "node_modules/pkg/a.js",
      "plugin/node_modules/pkg/a.ts",
      "node_modules/a.sh",
    ]) {
      expect(formatterFor(path)).toBeNull();
    }
  });

  test("formats repo source, dot directories included", () => {
    expect(formatterFor(".claude/hooks/guard-destructive.ts")?.tool).toBe("oxfmt");
  });
});

describe("diffHunks", () => {
  test("drops the header lines and keeps every hunk", () => {
    const hunks = [
      "@@ -1,2 +1,2 @@",
      '-import { $ } from "bun";',
      '+import { join } from "node:path";',
      "@@ -9 +9 @@ function main() {",
      "-  return  1;",
      "+  return 1;",
    ];

    const diff = [
      "diff --git 1/tmp/format-on-edit-x/a.ts 2/scripts/a.ts",
      "old mode 100644",
      "new mode 100755",
      "index c3f6b27..5612c88",
      "--- 1/tmp/format-on-edit-x/a.ts",
      "+++ 2/scripts/a.ts",
      ...hunks,
      "",
    ].join("\n");

    expect(diffHunks(diff)).toBe(hunks.join("\n"));
  });

  test("is empty when the diff holds no hunk", () => {
    expect(diffHunks("diff --git a/x b/y\nold mode 100644\nnew mode 100755\n")).toBe("");
  });
});

// shfmt drives these runs: oxfmt would need the repo's node_modules in the temp project.
describe("hook subprocess", () => {
  const HOOK = join(import.meta.dir, "format-on-edit.ts");
  const SESSION_ID = "format-on-edit-test";
  const MIS_INDENTED = "if true; then\necho hi\nfi\n";
  const FORMATTED = "if true; then\n  echo hi\nfi\n";

  let projectDir = "";
  let tempRoot = "";

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "format-on-edit-project-"));
    tempRoot = mkdtempSync(join(tmpdir(), "format-on-edit-tmp-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(tempRoot, { recursive: true, force: true });
  });

  async function runHook(filePath: string, env: Record<string, string> = {}) {
    const proc = Bun.spawn([process.execPath, HOOK], {
      stdin: new Blob([
        JSON.stringify({ session_id: SESSION_ID, tool_input: { file_path: filePath } }),
      ]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
        TMPDIR: tempRoot,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        ...env,
      },
    });

    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

    return { exitCode, stdout };
  }

  const markerFile = () => join(tempRoot, "claude-code-plugins-stop", SESSION_ID);

  test("returns a reformat as its unified diff, even under an external diff tool", async () => {
    const script = join(projectDir, "a.sh");
    const externalDiff = join(tempRoot, "external-diff.sh");
    writeFileSync(script, MIS_INDENTED);
    writeFileSync(externalDiff, "#!/bin/sh\necho EXTERNAL\n");
    chmodSync(externalDiff, 0o755);

    const { exitCode, stdout } = await runHook(script, { GIT_EXTERNAL_DIFF: externalDiff });

    expect(exitCode).toBe(0);

    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "`shfmt` reformatted `a.sh`; it now reads as this diff:\n" +
          "@@ -1,3 +1,3 @@\n if true; then\n-echo hi\n+  echo hi\n fi",
      },
    });

    expect(readFileSync(script, "utf8")).toBe(FORMATTED);
    expect(readFileSync(markerFile(), "utf8")).toBe("");
  });

  test("stays silent on a formatted executable file and still marks the session", async () => {
    const script = join(projectDir, "a.sh");
    writeFileSync(script, FORMATTED);
    chmodSync(script, 0o755);

    const { exitCode, stdout } = await runHook(script);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(existsSync(markerFile())).toBe(true);
  });

  test("returns a formatter failure as context", async () => {
    const script = join(projectDir, "broken.sh");
    writeFileSync(script, "if true; then\n");

    const { exitCode, stdout } = await runHook(script);

    expect(exitCode).toBe(0);

    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: expect.stringMatching(
          /^`shfmt` failed on `broken\.sh`:\n.*statement list/su,
        ),
      },
    });
  });

  test("returns a formatter missing from PATH as context, not as a crash", async () => {
    const script = join(projectDir, "a.sh");
    writeFileSync(script, MIS_INDENTED);

    const { exitCode, stdout } = await runHook(script, { PATH: tempRoot });

    expect(exitCode).toBe(0);

    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: expect.stringMatching(
          /^`shfmt` failed on `a\.sh`:\n.*command not found/su,
        ),
      },
    });
  });

  test("ignores a file outside the project", async () => {
    const { exitCode, stdout } = await runHook("/elsewhere/a.sh");

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(existsSync(markerFile())).toBe(false);
  });

  test("ignores a file gone before the hook runs", async () => {
    const { exitCode, stdout } = await runHook(join(projectDir, "gone.sh"));

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });
});
