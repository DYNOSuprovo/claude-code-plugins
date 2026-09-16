import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The dependency direction of `.claude/rules/architecture.md`, held by a test: the domain
 * does no IO, the hooks module imports nothing of ours, the page never sees the server.
 */

const ROOT = join(import.meta.dir, "..");

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.tsx?$/u.test(entry.name) &&
        !entry.name.includes(".test.") &&
        !entry.name.includes(".spec."),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

function imports(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/gu)].map((m) => m[1] ?? "");
}

function offending(dir: string, forbidden: RegExp): string[] {
  return sources(dir).flatMap((file) =>
    imports(file)
      .filter((specifier) => forbidden.test(specifier))
      .map((specifier) => `${file.slice(ROOT.length + 1)} imports ${specifier}`),
  );
}

describe("dependency direction", () => {
  test("src/domain imports no runtime, no adapter, no application, no page", () => {
    expect(
      offending("src/domain", /^(node:|bun|\.\.\/(adapters|app|protocol)|\.\.\/\.\.\/ui)/u),
    ).toEqual([]);
  });

  test("hooks/ imports claude-code, its own siblings, and protocol.ts as types only", () => {
    const stray = sources("hooks").flatMap((file) => {
      const named = `${file.slice(ROOT.length + 1)} imports`;
      const lines = readFileSync(file, "utf8").matchAll(/^(import type )?.*?from\s+"([^"]+)";$/gmu);

      return [...lines].flatMap((line) => {
        const [, asType, specifier = ""] = line;

        if (specifier === "claude-code" || /^\.\/[a-z-]+\.ts$/u.test(specifier)) return [];

        return specifier === "../src/protocol.ts" && asType !== undefined
          ? []
          : [`${named} ${specifier}`];
      });
    });

    expect(stray).toEqual([]);
  });

  test("the page and its renderers never import the server side", () => {
    const forbidden = /^(node:|bun$|.*\/src\/(app|adapters)\/)/u;
    expect(offending("ui", forbidden)).toEqual([]);
    expect(offending("plugins", /^(.*\/src\/(app|adapters)\/)/u)).toEqual([]);
  });

  test("the server never imports the page", () => {
    expect(offending("src", /\/ui\/(?!index\.html)/u)).toEqual([]);
  });
});
