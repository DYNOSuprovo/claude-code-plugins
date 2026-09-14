import { describe, expect, test } from "bun:test";

import { failureReport } from "./run-gates.ts";

describe("failureReport", () => {
  test("lists each failing gate with its command and output, in table order", () => {
    const report = failureReport([
      { gate: "typecheck", command: "bun x tsgo --noEmit", exitCode: 0, output: "" },
      { gate: "lint-ts", command: "bun x oxlint", exitCode: 1, output: "x no-unused-vars" },
      { gate: "fmt", command: "bun x oxfmt --check", exitCode: 2, output: "scripts/a.ts" },
    ]);

    expect(report).toBe(
      "lint-ts: bun x oxlint\nx no-unused-vars\n\nfmt: bun x oxfmt --check\nscripts/a.ts",
    );
  });

  test("is empty when every gate passes", () => {
    const report = failureReport([
      { gate: "typecheck", command: "bun x tsgo --noEmit", exitCode: 0, output: "" },
    ]);

    expect(report).toBe("");
  });
});
