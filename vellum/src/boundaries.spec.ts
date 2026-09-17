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
        !entry.name.includes(".spec.") &&
        !entry.parentPath.split("/").includes("fixtures"),
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
  test("core/server/domain imports no runtime, no adapter, no application, no page", () => {
    expect(
      offending(
        "src/core/server/domain",
        /^(node:|bun|\.\.\/(adapters|app)|\.\.\/\.\.\/(protocol|page))/u,
      ),
    ).toEqual([]);
  });

  test("core/engine runs on claude-code and its own siblings alone; the rest reaches it as types only", () => {
    // The transpiler drops a type-only import, so `import type … from "../protocol.ts"`
    // never shows here, and a value import from anywhere but a sibling does.
    const transpiler = new Bun.Transpiler({ loader: "ts" });

    const stray = sources("src/core/engine").flatMap((file) =>
      transpiler
        .scanImports(readFileSync(file, "utf8"))
        .filter(({ path }) => path !== "claude-code" && !/^\.\/[a-z-]+\.ts$/u.test(path))
        .map(({ path, kind }) => `${file.slice(ROOT.length + 1)} imports ${path} (${kind})`),
    );

    expect(stray).toEqual([]);
  });

  test("the page and its renderers never import the server side", () => {
    const forbidden = /^(node:|bun$|.*\/server\/(app|adapters)\/)/u;
    expect(offending("src/core/page", forbidden)).toEqual([]);
    expect(offending("src/extensions", /^(.*\/server\/(app|adapters)\/)/u)).toEqual([]);
  });

  test("the server, the engine and the protocol never import the page", () => {
    expect(offending("src/core", /\/page\/(?!index\.html)/u)).toEqual([]);
  });
});
