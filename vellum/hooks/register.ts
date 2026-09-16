import type { EngineInterface, Register } from "claude-code";

import type { Host } from "./host.ts";
import { checkVerdict, lockFailed, lockVerdict } from "./lock.ts";
import { close, connect, restore, type Settle, type State, suspend } from "./mode.ts";
import { editedPath, type GateWire, sessionId } from "./parse.ts";
import { submitResult } from "./relay.ts";

const START_SKILL = "vellum:start";

const STOP_SKILL = "vellum:stop";

const SUBMIT = {
  name: "submit",
  description:
    "Submit plan.md from the vellum working directory for review in the browser. Call it once the plan and its artifacts are ready; the answer says whether to end your turn.",
  inputSchema: { type: "object" },
};

const UNREACHABLE: GateWire = {
  error: "the vellum review server is not answering; run /vellum:start again",
};

/**
 * Binds this dispatch's `$`. Every call is spelled here, the one place the loader follows it;
 * a timer a transition starts keeps the host it was given, as a closure over `$` would.
 */
function hostOf($: EngineInterface): Host {
  return {
    sessionId: () => $.session.id(),
    cwd: () => $.session.cwd(),
    pluginRoot: $.plugin.root,
    storeGet: (key) => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: (key) => $.store.delete(key),
    fetch: (url, init) => $.http.fetch(url, init),
    run: (argv, init) => $.process.run(argv, init),
    every: (ms, fn) => $.clock.every(ms, fn),
    submitPrompt: (text) => $.prompt.submit({ text }),
    status: (text) => $.ui.status(text),
    log: (text) => $.ui.log(text),
  };
}

export const register: Register = (on) => {
  let state: State = { kind: "idle" };

  const settle: Settle = async (host, from) => {
    if (state === from) state = await close(host, from);
  };

  on("session.start", async ($, e, next) => {
    await $.tool.register(SUBMIT);
    state = await restore(hostOf($), state, settle);

    return next(e);
  });

  on("skill.prompt", { skill: START_SKILL }, async ($, e, next) => {
    state = await connect(hostOf($), state, settle);
    const result = await next(e);

    if (state.kind === "idle") return result;
    // The page opens on the way in, so the reviewer can comment on the artifacts before v1.
    void state.live.server.open();

    // The reviewer reads the link here: `$.ui.log` does not show in the transcript, so the
    // skill is the deterministic channel the module owns.
    const lines = `Working directory: ${state.live.session.workdir}\nReview page: ${state.live.server.url}`;

    return { text: `${result.text}\n\n${lines}` };
  });

  // The way out is a skill, not `$.command.register`: a registered command takes the global
  // namespace, and `disable-model-invocation` keeps this one the reviewer's to run.
  on("skill.prompt", { skill: STOP_SKILL }, async ($, e, next) => {
    const line =
      state.kind === "idle"
        ? "no vellum planning in progress"
        : `vellum planning closed; ${state.live.session.workdir} is kept`;

    state = await close(hostOf($), state);
    const result = await next(e);

    return { text: `${result.text}\n\n${line}` };
  });

  // The deterministic way the mode ends when the session forgets it: a `/clear` mints a new
  // session id, so the old poll and heartbeat would run on until the next way in noticed.
  on("command.run", { command: ["clear", "resume"] }, async ($, e, next) => {
    const result = await next(e);

    if (state.kind === "idle") return result;
    const host = hostOf($);

    const left =
      e.command === "clear" || sessionId(await host.sessionId()) !== state.live.session.id;

    if (left) state = suspend(host, state);

    return result;
  });

  on("tool.check", async ($, e, next) => {
    if (state.kind === "idle") return next(e);
    // ponytail: the lock reads the file tools only, so a shell command the session's own flow
    // approves still writes anywhere; a command classifier is the upgrade if that ever bites.
    const path = editedPath(e.tool, e.input);

    if (path === null) return checkVerdict(e.tool, await next(e));
    const { project, workdir } = state.live.session;
    const verdict = lockVerdict(path, await $.session.cwd(), project, workdir);

    if (verdict.kind === "deny") return { decision: "deny", reason: verdict.reason };

    if (verdict.kind === "allow") return { decision: "allow" };

    return checkVerdict(e.tool, await next(e));
  }).catch((_, e, next) => (state.kind === "idle" ? next(e) : lockFailed(next.error.kind)));

  on("tool.call", { tool: "mcp__vellum__submit" }, async ($) => {
    if (state.kind === "idle") return { deny: "no vellum planning in progress; run /vellum:start" };
    const gate = await state.live.server.gate().catch(() => UNREACHABLE);

    if (!("error" in gate)) $.ui.status(`plan v${gate.version} under review`);

    return submitResult(gate);
  });
};
