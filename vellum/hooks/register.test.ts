/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions -- this harness hands the hooks module the events, store values and JSON the engine would pass as unknown: the loose types ARE the boundary under test, and the fake `$` carries only the members the module calls. */
import { describe, expect, test } from "bun:test";

import type { EngineInterface, HttpResponse, Timer } from "claude-code";

import { lockVerdict, register, submitResult } from "./register.ts";

/**
 * The hooks module runs in the engine's own environment, which `bun test`
 * cannot host; `register` is called with a recording `on` and a `$` answered
 * from memory instead.
 */

type Hook = ($: EngineInterface, e: unknown, next: (e: unknown) => unknown) => unknown;

type Route = (body: string | undefined) => HttpResponse;

type FakeTimer = { ms: number; fn: () => void; cancelled: boolean };

/** One loaded module, its fake engine, and what the module did to it. */
type Harness = {
  $: EngineInterface;
  readonly hooks: Map<string, Hook>;
  readonly prompts: string[];
  readonly runs: string[][];
  readonly store: Map<string, unknown>;
  readonly timers: FakeTimer[];
  readonly tools: string[];
  readonly commands: string[];
  /** Every path the module fetched, in order. */
  readonly calls: string[];
  /** Ports of the servers `process.run` started in this test; any other port is dead. */
  readonly ports: Set<number>;
  status: string | undefined;
};

const SERVER = { port: 4242, token: "tok", pid: 7 };

const SESSION_ID = "4c2a9d93-c356-436e-bd4f-898a7b844bda";

const OTHER_ID = "8f10bb27-2b71-4a0e-9d2c-5c5f0ab0d3e1";

const DATE = new Date().toISOString().slice(0, 10);

const WORKDIR = `plans/${DATE}/wip-4c2a9d93/`;

const FINAL = `plans/${DATE}/notification-settings/`;

const CWD = "/project";

const DENIED = {
  kind: "deny",
  reason: `vellum is planning: files outside ${WORKDIR} change after the plan is approved`,
} as const;

const LIVE: Record<string, Route> = {
  "/api/review": () => reply(200, { workspace: { kind: "drafting" } }),
  "/api/heartbeat": () => reply(204, null),
  "/api/gate": () => reply(200, { version: 1, kept: false }),
  "/api/pending": () => reply(200, { kind: "none" }),
  "/api/open": () => reply(204, null),
};

function reply(status: number, value: unknown): HttpResponse {
  return { status, ok: status < 300, headers: {}, text: JSON.stringify(value) };
}

function harness(routes: Record<string, Route>): Harness {
  const h: Harness = {
    $: {} as EngineInterface,
    hooks: new Map(),
    prompts: [],
    runs: [],
    store: new Map(),
    timers: [],
    tools: [],
    commands: [],
    calls: [],
    ports: new Set(),
    status: undefined,
  };

  h.$ = {
    plugin: { name: "vellum", root: "/plugin" },
    session: { id: () => Promise.resolve(SESSION_ID), cwd: () => Promise.resolve(CWD) },
    http: {
      fetch: (url: string, init?: { body?: string }) => {
        const parsed = new URL(url);
        h.calls.push(parsed.pathname);
        const route = h.ports.has(Number(parsed.port)) ? routes[parsed.pathname] : undefined;

        return route === undefined
          ? Promise.reject(new Error(`ECONNREFUSED ${url}`))
          : Promise.resolve(route(init?.body));
      },
    },
    process: {
      run: (argv: readonly string[]) => {
        h.runs.push([...argv]);
        h.ports.add(SERVER.port);

        return Promise.resolve({ exitCode: 0, stdout: `${JSON.stringify(SERVER)}\n`, stderr: "" });
      },
    },
    store: {
      get: (key: string) => Promise.resolve(h.store.get(key)),
      set: (key: string, value: unknown) => Promise.resolve(void h.store.set(key, value)),
      delete: (key: string) => Promise.resolve(void h.store.delete(key)),
    },
    clock: {
      every: (ms: number, fn: () => void): Timer => {
        const timer = { ms, fn, cancelled: false };
        h.timers.push(timer);

        return { cancel: () => void (timer.cancelled = true) };
      },
    },
    prompt: {
      submit: (input: { text: string }) => {
        h.prompts.push(input.text);

        return Promise.resolve({ text: input.text });
      },
    },
    tool: {
      register: (tool: { name: string }) => {
        h.tools.push(tool.name);

        return Promise.resolve({ tool: `mcp__vellum__${tool.name}` });
      },
    },
    command: {
      register: (command: { name: string }) => {
        h.commands.push(command.name);

        return Promise.resolve({ command: command.name });
      },
    },
    ui: { status: (text: string | undefined) => void (h.status = text), log: () => {} },
  } as unknown as EngineInterface;

  // Keyed as `claude plugin validate` prints them: two `skill.prompt` hooks are two entries.
  register(
    ((event: string, matcher: unknown, fn?: Hook) => {
      const key = fn === undefined ? event : `${event}{${Object.values(matcher as object).join()}}`;
      h.hooks.set(key, fn ?? (matcher as Hook));
    }) as never,
    {},
  );

  return h;
}

function hook(h: Harness, event: string): Hook {
  const found = h.hooks.get(event);

  if (found === undefined) throw new Error(`no ${event} hook`);

  return found;
}

function passed(event: unknown): unknown {
  return { passed: event };
}

function call(h: Harness, event: string, e: unknown): Promise<unknown> {
  return Promise.resolve(hook(h, event)(h.$, e, passed));
}

function skillBody(): Promise<unknown> {
  return Promise.resolve({ text: "t" });
}

function invokeSkill(h: Harness, skill = "vellum:plan"): Promise<unknown> {
  const e = { skill, text: "t" };

  return Promise.resolve(hook(h, `skill.prompt{${skill}}`)(h.$, e, skillBody));
}

/** A module whose `/vellum:plan` reached a server: the mode is live and the poll runs. */
async function planning(routes: Record<string, Route> = LIVE): Promise<Harness> {
  const h = harness(routes);
  await invokeSkill(h);

  return h;
}

/** Fires every live one-second poll twice, letting the promises settle in between. */
async function tick(h: Harness): Promise<void> {
  for (let n = 0; n < 2; n += 1) {
    for (const timer of h.timers) if (!timer.cancelled && timer.ms === 1000) timer.fn();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

function batch(n: number): { batch: number; path: string } {
  return { batch: n, path: `${WORKDIR}.review/v0.feedback-${n}.md` };
}

function draftsPrompt(...batches: number[]): string {
  const paths = batches.map((n) => batch(n).path).join(", ");

  return `Drafting feedback from the vellum review page: read ${paths}, revise the files they name, then continue the plan.`;
}

function polling(h: Harness): boolean {
  return h.timers.some((timer) => timer.ms === 1000 && !timer.cancelled);
}

function beating(h: Harness): boolean {
  return h.timers.some((timer) => timer.ms === 30_000 && !timer.cancelled);
}

describe("lockVerdict", () => {
  test("a file under the working directory is allowed outright", () => {
    expect(
      lockVerdict("Edit", { file_path: `${CWD}/${WORKDIR}mockup.html` }, CWD, WORKDIR),
    ).toEqual({ kind: "allow" });
  });

  test("a file outside it is denied, with the reason the model reads", () => {
    expect(lockVerdict("Write", { file_path: `${CWD}/src/cli.ts` }, CWD, WORKDIR)).toEqual(DENIED);
  });

  test("a relative path is resolved against the session's directory", () => {
    expect(lockVerdict("Edit", { file_path: `${WORKDIR}notes.md` }, CWD, WORKDIR)).toEqual({
      kind: "allow",
    });
    expect(lockVerdict("Edit", { file_path: `${WORKDIR}../escape.md` }, CWD, WORKDIR)).toEqual(
      DENIED,
    );
  });

  test("NotebookEdit is read on notebook_path", () => {
    expect(lockVerdict("NotebookEdit", { notebook_path: "src/n.ipynb" }, CWD, WORKDIR)).toEqual(
      DENIED,
    );
  });

  test.each(["Bash", "Read", "mcp__other__write"])(
    "%s is no file tool: the session decides",
    (tool) => {
      expect(lockVerdict(tool, { command: "rm -rf /" }, CWD, WORKDIR)).toEqual({ kind: "check" });
    },
  );
});

describe("submitResult", () => {
  test("a recorded version tells the model to end its turn", () => {
    expect(submitResult({ version: 1, kept: false })).toEqual({
      result:
        "Plan v1 is under review in the browser. End your turn; the review arrives as a prompt.",
    });
  });

  test("a kept version says the plan is already under review", () => {
    expect(submitResult({ version: 2, kept: true })).toEqual({
      result:
        "Plan v2 is already under review in the browser. End your turn; the review arrives as a prompt.",
    });
  });

  test("an error is the deny the model reads", () => {
    expect(submitResult({ error: "write plan.md in x/ first" })).toEqual({
      deny: "write plan.md in x/ first",
    });
  });
});

describe("session.start", () => {
  test("registers the submit tool, and nothing in the global command namespace", async () => {
    const h = harness(LIVE);
    expect(await call(h, "session.start", { cwd: CWD })).toEqual({ passed: { cwd: CWD } });
    expect(h.tools).toEqual(["submit"]);
    expect(h.commands).toEqual([]);
  });

  test("a reload finds the live server the store kept and polls again", async () => {
    const h = harness(LIVE);
    h.ports.add(SERVER.port);
    h.store.set(`session:${SESSION_ID}`, { id: SESSION_ID, server: SERVER, workdir: WORKDIR });
    await call(h, "session.start", { cwd: CWD });
    expect(polling(h)).toBe(true);
    expect(beating(h)).toBe(true);
  });

  test("the gate of phase 1 is gone: no classic hook is registered", () => {
    expect([...harness(LIVE).hooks.keys()]).toEqual([
      "session.start",
      "skill.prompt{vellum:plan}",
      "skill.prompt{vellum:stop}",
      "tool.check",
      "tool.call{mcp__vellum__submit}",
    ]);
  });
});

describe("skill.prompt", () => {
  test("starts the server once, stores it, and appends the working directory", async () => {
    const h = await planning();
    const second = await invokeSkill(h);
    expect(second).toEqual({ text: `t\n\nWorking directory: ${WORKDIR}` });
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0]?.slice(0, 3)).toEqual(["bun", "/plugin/src/cli.ts", "start"]);
    expect(h.store.get(`session:${SESSION_ID}`)).toEqual({
      id: SESSION_ID,
      server: SERVER,
      workdir: WORKDIR,
    });
    expect(h.status).toBe("planning");
    expect(h.calls).toContain("/api/open");
  });

  test("returns the skill text without a directory when the launcher cannot start", async () => {
    const h = harness(LIVE);
    h.$.process.run = () => Promise.reject(new Error("ENOENT bun"));
    expect(await invokeSkill(h)).toEqual({ text: "t" });
  });

  test("restarts the server when the stored one is dead", async () => {
    const h = harness(LIVE);
    h.store.set(`session:${SESSION_ID}`, { id: SESSION_ID, server: { ...SERVER, port: 1 } });
    await invokeSkill(h);
    expect(h.runs).toHaveLength(1);
    expect(h.store.get(`session:${SESSION_ID}`)).toMatchObject({ server: SERVER });
  });

  test("a session id the live server does not belong to starts a second one", async () => {
    const h = await planning();
    h.$.session.id = () => Promise.resolve(OTHER_ID);
    await invokeSkill(h);
    expect(h.runs).toHaveLength(2);
    expect(h.runs[1]).toContain(`plans/${DATE}/wip-8f10bb27/`);
  });
});

describe("tool.check", () => {
  test("outside the mode every call passes on", async () => {
    const h = harness(LIVE);
    const e = { tool: "Write", input: { file_path: `${CWD}/src/cli.ts` } };
    expect(await call(h, "tool.check", e)).toEqual({ passed: e });
  });

  test("in the mode a write outside the working directory is denied", async () => {
    const h = await planning();
    const e = { tool: "Edit", input: { file_path: `${CWD}/src/cli.ts` } };
    expect(await call(h, "tool.check", e)).toEqual({ decision: "deny", reason: DENIED.reason });
  });

  test("in the mode a write under the working directory is allowed, whatever the session's mode", async () => {
    const h = await planning();
    const e = { tool: "Write", input: { file_path: `${WORKDIR}plan.md` } };
    expect(await call(h, "tool.check", e)).toEqual({ decision: "allow" });
  });

  test("a command a settings rule approved goes back to the person, one the mode allowed does not", async () => {
    const h = await planning();
    const e = { tool: "Bash", input: { command: "mkdir -p out" } };

    const checked = (rule?: string): unknown =>
      hook(h, "tool.check")(h.$, e, () => ({ decision: "allow", rule }));

    expect(await checked("Bash(mkdir:*)")).toEqual({ decision: "ask", rule: "Bash(mkdir:*)" });
    expect(await checked()).toEqual({ decision: "allow", rule: undefined });
  });

  test("a rule on a tool that writes no file keeps the engine's allow", async () => {
    const h = await planning();
    const e = { tool: "WebFetch", input: { url: "https://x.test" } };
    const engine = { decision: "allow", rule: "WebFetch(domain:x.test)" };
    expect(await hook(h, "tool.check")(h.$, e, () => engine)).toEqual(engine);
  });
});

describe("tool.call mcp__vellum__submit", () => {
  const e = { tool: "mcp__vellum__submit", tool_use_id: "t1" };

  function submit(h: Harness): Promise<unknown> {
    return call(h, `tool.call{${e.tool}}`, e);
  }

  test("posts the gate and names the version, without running the tool", async () => {
    const h = await planning();
    expect(await submit(h)).toEqual({
      result:
        "Plan v1 is under review in the browser. End your turn; the review arrives as a prompt.",
    });
    expect(h.status).toBe("plan v1 under review");
  });

  test("a gate that refuses is the deny the model reads", async () => {
    const h = await planning({
      ...LIVE,
      "/api/gate": () => reply(409, { error: `write plan.md in ${WORKDIR} first` }),
    });

    expect(await submit(h)).toEqual({ deny: `write plan.md in ${WORKDIR} first` });
  });

  test("outside the mode it names the way in", async () => {
    expect(await submit(harness(LIVE))).toEqual({
      deny: "no vellum planning in progress; run /vellum:plan",
    });
  });

  test("a server that does not answer is a deny too", async () => {
    const h = await planning();
    h.ports.clear();
    expect(await submit(h)).toMatchObject({ deny: expect.stringContaining("not answering") });
  });
});

describe("skill.prompt vellum:stop", () => {
  function stop(h: Harness): Promise<unknown> {
    return invokeSkill(h, "vellum:stop");
  }

  test("closes the mode, keeps the directory, and stops every timer", async () => {
    const h = await planning();
    expect(await stop(h)).toEqual({ text: `t\n\nvellum planning closed; ${WORKDIR} is kept` });
    expect(h.store.has(`session:${SESSION_ID}`)).toBe(false);
    expect(h.timers.every((timer) => timer.cancelled)).toBe(true);
    expect(h.status).toBeUndefined();
  });

  test("keeps the relayed count, so a plan after a stop names no batch twice", async () => {
    const h = await planning();
    h.store.set(`relayed:${SESSION_ID}`, 2);
    await stop(h);
    expect(h.store.get(`relayed:${SESSION_ID}`)).toBe(2);
  });

  test("outside the mode it says so and starts nothing", async () => {
    const h = harness(LIVE);
    expect(await stop(h)).toEqual({ text: "t\n\nno vellum planning in progress" });
    expect(h.runs).toEqual([]);
  });
});

describe("the decision comes back as a prompt", () => {
  test("a feedback names the file once, and the mode stays live", async () => {
    let pending: unknown = { kind: "none" };
    const h = await planning({ ...LIVE, "/api/pending": () => reply(200, pending) });
    await tick(h);
    expect(h.prompts).toEqual([]);
    pending = { kind: "feedback", version: 1, path: `${WORKDIR}.review/v1.feedback.md` };
    await tick(h);
    await tick(h);
    expect(h.prompts).toEqual([
      `Plan review v1: changes requested. Read ${WORKDIR}.review/v1.feedback.md, revise plan.md and the files it names, then call mcp__vellum__submit again.`,
    ]);
    expect(polling(h)).toBe(true);
  });

  test("an approval names the final directory, then the mode is idle", async () => {
    const approved = (): HttpResponse => reply(200, { kind: "approved", version: 2, dir: FINAL });
    const h = await planning({ ...LIVE, "/api/pending": approved });
    await tick(h);
    expect(h.prompts).toEqual([
      `Plan v2 approved. It lives at ${FINAL}. Implement it here or in a fresh session.`,
    ]);
    expect(polling(h)).toBe(false);
    expect(h.store.has(`session:${SESSION_ID}`)).toBe(false);
  });

  test("a drafting batch is named once, and the next batches in one prompt", async () => {
    let batches = [batch(1)];

    const h = await planning({
      ...LIVE,
      "/api/pending": () => reply(200, { kind: "drafts", batches }),
    });

    await tick(h);
    await tick(h);
    expect(h.prompts).toEqual([draftsPrompt(1)]);
    batches = [batch(1), batch(2), batch(3)];
    await tick(h);
    expect(h.prompts).toEqual([draftsPrompt(1), draftsPrompt(2, 3)]);
    expect(h.store.get(`relayed:${SESSION_ID}`)).toBe(3);
  });

  test("a batch the store says was relayed is not named again after a reload", async () => {
    const h = harness({
      ...LIVE,
      "/api/pending": () => reply(200, { kind: "drafts", batches: [batch(1)] }),
    });

    h.ports.add(SERVER.port);
    h.store.set(`session:${SESSION_ID}`, { id: SESSION_ID, server: SERVER, workdir: WORKDIR });
    h.store.set(`relayed:${SESSION_ID}`, 1);
    await call(h, "session.start", { cwd: CWD });
    await tick(h);
    expect(h.prompts).toEqual([]);
  });

  test("a dropped prompt keeps the poll alive; the next tick retries", async () => {
    let drop = true;
    const approved = (): HttpResponse => reply(200, { kind: "approved", version: 1, dir: FINAL });
    const h = harness({ ...LIVE, "/api/pending": approved });
    const submit = h.$.prompt.submit;
    h.$.prompt.submit = (input) => (drop ? Promise.resolve({ drop: "refused" }) : submit(input));
    await invokeSkill(h);
    await tick(h);
    expect(h.prompts).toEqual([]);
    expect(polling(h)).toBe(true);
    drop = false;
    await tick(h);
    expect(h.prompts).toHaveLength(1);
    expect(polling(h)).toBe(false);
  });
});
