import { describe, expect, test } from "bun:test";

import {
  diffHunks,
  formatterFor,
  hookOutput,
  parseHookInput,
  toRepoRelative,
} from "./format-on-edit.ts";

describe("parseHookInput", () => {
  test("reads the session id and tool_input.file_path", () => {
    const input = parseHookInput(
      JSON.stringify({ session_id: "abc-123", tool_input: { file_path: "/repo/a.ts" } }),
    );

    expect(input?.session_id).toBe("abc-123");
    expect(input?.tool_input?.file_path).toBe("/repo/a.ts");
  });

  test("reads a payload without a path as an absent path", () => {
    expect(
      parseHookInput(JSON.stringify({ tool_input: {} }))?.tool_input?.file_path,
    ).toBeUndefined();
  });

  test("returns null on invalid JSON", () => {
    expect(parseHookInput("not json")).toBeNull();
  });
});

describe("toRepoRelative", () => {
  test("strips the repo root", () => {
    expect(toRepoRelative("/repo/scripts/a.ts", "/repo")).toBe("scripts/a.ts");
  });

  test("tolerates a trailing slash on the root", () => {
    expect(toRepoRelative("/repo/scripts/a.ts", "/repo/")).toBe("scripts/a.ts");
  });

  test("returns null for a file outside the repo", () => {
    expect(toRepoRelative("/elsewhere/a.ts", "/repo")).toBeNull();
  });

  test("passes a relative path through", () => {
    expect(toRepoRelative("scripts/a.ts", "/repo")).toBe("scripts/a.ts");
  });
});

describe("formatterFor", () => {
  test("sends the four script extensions to oxfmt", () => {
    for (const path of ["a.ts", "a.js", "a.mjs", "a.cjs"]) {
      expect(formatterFor(path)).toEqual({ tool: "oxfmt", argv: ["bun", "x", "oxfmt", path] });
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

  test("has none under the paths oxfmt ignores", () => {
    expect(formatterFor("archive/plugin/a.ts")).toBeNull();
    expect(formatterFor("archive/plugin/a.sh")).toBeNull();
    expect(formatterFor("node_modules/pkg/a.js")).toBeNull();
    expect(formatterFor("tools/oxlint/anti-slop/index.ts")).toBeNull();
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

describe("hookOutput", () => {
  test("wraps the context in the PostToolUse output shape", () => {
    expect(JSON.parse(hookOutput("context"))).toEqual({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "context" },
    });
  });
});
