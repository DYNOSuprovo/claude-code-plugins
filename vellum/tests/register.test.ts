import { describe, expect, test, tier } from "claude-code/testing";

tier("user");

describe("register", () => {
  test("the start registers submit and takes no command name", async ($, on) => {
    const tools: string[] = [];
    const commands: string[] = [];

    on("session.start", (_, e) => ({ cwd: e.cwd }));

    on("tool.register", (_, e) => {
      tools.push(e.name);

      return { value: { tool: `mcp__vellum__${e.name}` } };
    });

    on("command.register", (_, e) => {
      commands.push(e.name);

      return { value: { command: e.name } };
    });

    await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/project" });

    expect(tools).toEqual(["submit"]);
    expect(commands, "the way in and the way out are skills").toEqual([]);
  });
});
