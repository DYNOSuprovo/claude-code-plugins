import { describe, expect, test, tier } from "claude-code/testing";

import {
  batch,
  CWD,
  draftsPrompt,
  FINAL,
  HEARTBEAT_MS,
  OTHER_ID,
  OTHER_WORKDIR,
  PLAN_PROMPT,
  relayed,
  reply,
  SERVER,
  SESSION,
  SESSION_ID,
  STOP_PROMPT,
  storedSession,
  tick,
  typedCommand,
  WORKDIR,
  world,
} from "./fixtures/index.ts";

tier("user");

const DENIAL = `vellum is planning: files outside ${WORKDIR} change after the plan is approved`;

const ENGINE = { decision: "ask", reason: "the session's own flow" } as const;

describe("session.start", () => {
  test("registers the submit tool, and nothing in the global command namespace", async ($, on) => {
    const seen = world(on);

    expect(await $.session.start(SESSION)).toEqual({ cwd: CWD });
    expect(seen.tools).toEqual(["submit"]);
    expect(seen.commands).toEqual([]);
  });

  test("a reload finds the live server the store kept and polls again", async ($, on) => {
    const seen = world(on, { stored: storedSession() });

    await $.session.start(SESSION);
    await seen.clock.advance(HEARTBEAT_MS);

    expect(seen.paths).toContain("/api/pending");
    expect(seen.paths).toContain("/api/heartbeat");
  });
});

describe("skill.prompt", () => {
  test("starts the server once, stores it, and appends the working directory", async ($, on) => {
    const seen = world(on);

    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.skill.prompt(PLAN_PROMPT)).toEqual({
      text: `t\n\nWorking directory: ${WORKDIR}`,
    });

    expect(seen.runs).toHaveLength(1);
    expect(seen.runs[0]?.slice(0, 3)).toEqual([
      "bun",
      expect.stringContaining("/src/cli.ts"),
      "start",
    ]);
    expect(seen.store.get(`session:${SESSION_ID}`)).toEqual(
      storedSession()[`session:${SESSION_ID}`],
    );
    expect(seen.statuses.at(-1)).toBe("planning");
    expect(seen.paths).toContain("/api/open");
  });

  test("returns the skill text without a directory when the launcher cannot start", async ($, on) => {
    world(on, { launch: { deny: "ENOENT bun" } });

    expect(await $.skill.prompt(PLAN_PROMPT)).toEqual({ text: "t" });
  });

  test("restarts the server when the stored one is dead", async ($, on) => {
    const seen = world(on, { stored: storedSession({ ...SERVER, port: 1 }) });

    await $.skill.prompt(PLAN_PROMPT);

    expect(seen.paths[0]).toBe("/api/review");
    expect(seen.runs).toHaveLength(1);
    expect(seen.store.get(`session:${SESSION_ID}`)).toMatchObject({ server: SERVER });
  });

  test("the restarted server keeps the directory and the project the plan was started in", async ($, on) => {
    const workdir = "plans/2020-01-01/wip-4c2a9d93/";

    const seen = world(on, {
      stored: storedSession({ ...SERVER, port: 1 }, "/elsewhere", workdir),
    });

    expect(await $.skill.prompt(PLAN_PROMPT)).toEqual({
      text: `t\n\nWorking directory: ${workdir}`,
    });

    expect(seen.runs[0]?.slice(5)).toEqual(["--project", "/elsewhere", "--workdir", workdir]);
  });

  test("a session id the live server does not belong to starts a second one", async ($, on) => {
    const seen = world(on);

    await $.skill.prompt(PLAN_PROMPT);
    seen.id = OTHER_ID;
    await $.skill.prompt(PLAN_PROMPT);

    expect(seen.runs).toHaveLength(2);
    expect(seen.runs[1]).toContain(OTHER_WORKDIR);
  });
});

describe("tool.check", () => {
  test("outside the mode every call passes on", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `${CWD}/src/cli.ts` } }),
    ).toEqual(ENGINE);
  });

  test("in the mode a write under the project and outside the working directory is denied", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.tool.check({ tool: "Edit", input: { file_path: `${CWD}/src/cli.ts` } })).toEqual(
      {
        decision: "deny",
        reason: DENIAL,
      },
    );
  });

  test("in the mode a write under the working directory is allowed, whatever the session's mode", async ($, on) => {
    world(on);
    on("tool.check", () => ({ decision: "deny", reason: "the session refuses every write" }));
    await $.skill.prompt(PLAN_PROMPT);

    expect(
      await $.tool.check({ tool: "Write", input: { file_path: `${WORKDIR}plan.md` } }),
    ).toEqual({ decision: "allow" });
  });

  test("a command a settings rule approved goes back to the person, one the mode allowed does not", async ($, on) => {
    const ruled = { decision: "allow", rule: "Bash(mkdir:*)" } as const;
    const answers = [ruled, { decision: "allow" } as const];
    world(on);
    on("tool.check", () => answers.shift() ?? ruled);
    await $.skill.prompt(PLAN_PROMPT);
    const checked = () => $.tool.check({ tool: "Bash", input: { command: "mkdir -p out" } });

    expect(await checked(), "the rule decided, so the person does").toEqual({
      decision: "ask",
      rule: "Bash(mkdir:*)",
    });

    expect(await checked(), "no rule: the engine's allow stands").toEqual({ decision: "allow" });
  });

  test("a session directory the engine refuses fails the lock closed", async ($, on) => {
    const seen = world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(PLAN_PROMPT);
    seen.refuseCwd = "boom";

    expect(await $.tool.check({ tool: "Edit", input: { file_path: `${CWD}/src/cli.ts` } })).toEqual(
      {
        decision: "deny",
        reason: "vellum: the lock failed (throw); retry the call",
      },
    );
  });

  test("outside the mode a failing session directory changes nothing", async ($, on) => {
    const seen = world(on);
    on("tool.check", () => ENGINE);
    seen.refuseCwd = "boom";

    expect(await $.tool.check({ tool: "Edit", input: { file_path: `${CWD}/src/cli.ts` } })).toEqual(
      ENGINE,
    );
  });

  test("in the mode a write outside the project follows the session's own flow", async ($, on) => {
    world(on);
    on("tool.check", () => ENGINE);
    await $.skill.prompt(PLAN_PROMPT);
    const file_path = "/tmp/claude-1000/project/session/scratchpad/issue.md";

    expect(await $.tool.check({ tool: "Write", input: { file_path } })).toEqual(ENGINE);
  });

  test("a rule on a tool that writes no file keeps the engine's allow", async ($, on) => {
    const engine = { decision: "allow", rule: "WebFetch(domain:x.test)" } as const;
    world(on);
    on("tool.check", () => engine);
    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.tool.check({ tool: "WebFetch", input: { url: "https://x.test" } })).toEqual(
      engine,
    );
  });
});

describe("tool.call mcp__vellum__submit", () => {
  const submit = "mcp__vellum__submit";

  test("posts the gate and names the version, without running the tool", async ($, on) => {
    const seen = world(on);
    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.tool.call({ tool: submit })).toEqual({
      result:
        "Plan v1 is under review in the browser. End your turn; the review arrives as a prompt.",
    });

    expect(seen.statuses.at(-1)).toBe("plan v1 under review");
  });

  test("a gate that refuses is the deny the model reads", async ($, on) => {
    world(on, {
      routes: { "/api/gate": () => reply(409, { error: `write plan.md in ${WORKDIR} first` }) },
    });
    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.tool.call({ tool: submit })).toEqual({
      deny: `write plan.md in ${WORKDIR} first`,
    });
  });

  test("outside the mode it names the way in", async ($, on) => {
    world(on);

    expect(await $.tool.call({ tool: submit })).toEqual({
      deny: "no vellum planning in progress; run /vellum:plan",
    });
  });

  test("a server that does not answer is a deny too", async ($, on) => {
    world(on, { routes: { "/api/gate": () => null } });
    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.tool.call({ tool: submit })).toEqual({
      deny: "the vellum review server is not answering; run /vellum:plan again",
    });
  });
});

describe("skill.prompt vellum:stop", () => {
  test("closes the mode, keeps the directory, and stops every timer", async ($, on) => {
    const seen = world(on);
    await $.skill.prompt(PLAN_PROMPT);

    expect(await $.skill.prompt(STOP_PROMPT)).toEqual({
      text: `t\n\nvellum planning closed; ${WORKDIR} is kept`,
    });

    const from = seen.paths.length;
    await seen.clock.advance(HEARTBEAT_MS);

    expect(seen.store.has(`session:${SESSION_ID}`)).toBe(false);
    expect(seen.paths.slice(from), "no poll and no heartbeat after the way out").toEqual([]);
    expect(seen.statuses.at(-1)).toBeUndefined();
  });

  test("keeps the relayed record, so a plan after a stop names no batch twice", async ($, on) => {
    const seen = world(on, { stored: { [`relayed:${SESSION_ID}`]: relayed(2) } });
    await $.skill.prompt(PLAN_PROMPT);
    await $.skill.prompt(STOP_PROMPT);

    expect(seen.store.get(`relayed:${SESSION_ID}`)).toEqual(relayed(2));
  });

  test("outside the mode it says so and starts nothing", async ($, on) => {
    const seen = world(on);

    expect(await $.skill.prompt(STOP_PROMPT)).toEqual({
      text: "t\n\nno vellum planning in progress",
    });

    expect(seen.runs).toEqual([]);
  });
});

describe("command.run", () => {
  test("/clear closes the mode it finds live", async ($, on) => {
    const seen = world(on);
    on("command.run", () => ({}));
    await $.skill.prompt(PLAN_PROMPT);
    await $.command.run(typedCommand("clear"));

    const from = seen.paths.length;
    await seen.clock.advance(HEARTBEAT_MS);

    expect(seen.store.has(`session:${SESSION_ID}`)).toBe(false);
    expect(seen.statuses.at(-1)).toBeUndefined();
    expect(seen.paths.slice(from), "no poll and no heartbeat after a clear").toEqual([]);
  });

  test("/resume closes it the same way", async ($, on) => {
    const seen = world(on);
    on("command.run", () => ({}));
    await $.skill.prompt(PLAN_PROMPT);
    await $.command.run(typedCommand("resume"));

    expect(seen.store.has(`session:${SESSION_ID}`)).toBe(false);
    expect(seen.statuses.at(-1)).toBeUndefined();
  });

  test("outside the mode a /clear runs and touches nothing", async ($, on) => {
    const seen = world(on);
    on("command.run", () => ({ text: "conversation cleared" }));

    expect(await $.command.run(typedCommand("clear"))).toEqual({ text: "conversation cleared" });
    expect(seen.statuses).toEqual([]);
    expect(seen.store.size).toBe(0);
  });
});

describe("the decision comes back as a prompt", () => {
  const feedback = `${WORKDIR}.review/v1.feedback.md`;

  test("a feedback names the file once, and the mode stays live", async ($, on) => {
    const NONE = { kind: "none" };
    const CHANGES = { kind: "feedback", version: 1, path: feedback };
    let pending: typeof NONE | typeof CHANGES = NONE;
    const seen = world(on, { routes: { "/api/pending": () => reply(200, pending) } });
    await $.skill.prompt(PLAN_PROMPT);
    await tick(seen);

    expect(seen.prompts).toEqual([]);
    pending = CHANGES;
    await tick(seen);
    await tick(seen);

    expect(seen.prompts).toEqual([
      `Plan review v1: changes requested. Read ${feedback}, revise plan.md and the files it names, then call mcp__vellum__submit again.`,
    ]);

    const from = seen.paths.length;
    await tick(seen);

    expect(seen.paths.slice(from), "the poll is still running").toEqual(["/api/pending"]);
  });

  test("an approval names the final directory, then the mode is idle", async ($, on) => {
    const seen = world(on, {
      routes: { "/api/pending": () => reply(200, { kind: "approved", version: 2, dir: FINAL }) },
    });

    await $.skill.prompt(PLAN_PROMPT);
    await tick(seen);

    expect(seen.prompts).toEqual([
      `Plan v2 approved. It lives at ${FINAL}. Implement it here or in a fresh session.`,
    ]);

    const from = seen.paths.length;
    await seen.clock.advance(HEARTBEAT_MS);

    expect(seen.paths.slice(from), "the poll stopped with the mode").toEqual([]);
    expect(seen.store.has(`session:${SESSION_ID}`)).toBe(false);
  });

  test("a drafting batch is named once, and the next batches in one prompt", async ($, on) => {
    let batches = [batch(1)];
    const drafts = () => reply(200, { kind: "drafts", batches });
    const seen = world(on, { routes: { "/api/pending": drafts } });
    await $.skill.prompt(PLAN_PROMPT);
    await tick(seen);
    await tick(seen);

    expect(seen.prompts).toEqual([draftsPrompt(1)]);
    batches = [batch(1), batch(2), batch(3)];
    await tick(seen);

    expect(seen.prompts).toEqual([draftsPrompt(1), draftsPrompt(2, 3)]);
    expect(seen.store.get(`relayed:${SESSION_ID}`)).toEqual(relayed(3));
  });

  test("a batch the store says was relayed is not named again after a reload", async ($, on) => {
    const seen = world(on, {
      routes: { "/api/pending": () => reply(200, { kind: "drafts", batches: [batch(1)] }) },
      stored: { ...storedSession(), [`relayed:${SESSION_ID}`]: relayed(1) },
    });

    await $.session.start(SESSION);
    await tick(seen);

    expect(seen.prompts).toEqual([]);
  });

  test("a feedback the store says was relayed is not named again after a reload", async ($, on) => {
    const seen = world(on, {
      routes: {
        "/api/pending": () => reply(200, { kind: "feedback", version: 1, path: feedback }),
      },
      stored: { ...storedSession(), [`relayed:${SESSION_ID}`]: relayed(0, 1) },
    });

    await $.session.start(SESSION);
    await tick(seen);

    expect(seen.prompts).toEqual([]);
  });

  test("a record kept for another working directory counts for nothing", async ($, on) => {
    const seen = world(on, {
      routes: { "/api/pending": () => reply(200, { kind: "drafts", batches: [batch(1)] }) },
      stored: {
        ...storedSession(),
        [`relayed:${SESSION_ID}`]: relayed(1, 0, "plans/2020-01-01/wip-x/"),
      },
    });

    await $.session.start(SESSION);
    await tick(seen);

    expect(seen.prompts).toEqual([draftsPrompt(1)]);
  });

  test("an approval drops the record, so the next plan's first batch is named", async ($, on) => {
    const seen = world(on, {
      routes: { "/api/pending": () => reply(200, { kind: "approved", version: 1, dir: FINAL }) },
      stored: { [`relayed:${SESSION_ID}`]: relayed(2) },
    });

    await $.skill.prompt(PLAN_PROMPT);
    await tick(seen);

    expect(seen.store.has(`relayed:${SESSION_ID}`)).toBe(false);
  });

  test("a dropped prompt keeps the poll alive; the next tick retries", async ($, on) => {
    const seen = world(on, {
      routes: { "/api/pending": () => reply(200, { kind: "approved", version: 1, dir: FINAL }) },
    });

    seen.drop = "refused";
    await $.skill.prompt(PLAN_PROMPT);
    await tick(seen);

    expect(seen.prompts).toEqual([]);
    seen.drop = undefined;
    await tick(seen);

    expect(seen.prompts).toHaveLength(1);
  });
});
