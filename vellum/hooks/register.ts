import type { EngineInterface, HttpInit, HttpResponse, Register, Timer } from "claude-code";

type ServerInfo = { readonly port: number; readonly token: string; readonly pid: number };

/** What `$.store` keeps under `session:<id>`, so a reloaded module finds its server again. */
type Session = { readonly id: string; readonly server: ServerInfo; readonly workdir: string };

/** A reachable review server and the timer that keeps it alive. */
type Live = { readonly session: Session; readonly heartbeat: Timer };

type DraftBatch = { readonly batch: number; readonly path: string };

type Pending =
  | { readonly kind: "none" }
  | { readonly kind: "drafts"; readonly batches: readonly DraftBatch[] }
  | { readonly kind: "feedback"; readonly version: number; readonly path: string }
  | { readonly kind: "approved"; readonly version: number; readonly dir: string };

/** What `POST /api/gate` answers: the version the browser shows, or why it shows none. */
type Gate = { readonly version: number; readonly kept: boolean } | { readonly error: string };

/**
 * `allow` runs the call whatever the session's mode, `check` hands it to the session's own
 * permission flow, `deny` refuses it with the reason the model reads.
 */
export type Verdict =
  | { readonly kind: "allow" }
  | { readonly kind: "check" }
  | { readonly kind: "deny"; readonly reason: string };

/**
 * The vellum mode, entered by `/vellum:plan` and left by Approve or `/vellum:stop`. While
 * `live` a server answers, the lock holds, and the browser's decision is polled. What is
 * under review lives on the server's disk; every transition here is an engine event or an
 * answer from that server.
 */
type State =
  | { readonly kind: "idle" }
  | { readonly kind: "live"; readonly live: Live; readonly poll: Timer };

const PLAN_SKILL = "vellum:plan";

const STOP_SKILL = "vellum:stop";

const SUBMIT_TOOL = "mcp__vellum__submit";

const SUBMIT = {
  name: "submit",
  description:
    "Submit plan.md from the vellum working directory for review in the browser. Call it once the plan and its artifacts are ready; the answer says whether to end your turn.",
  inputSchema: { type: "object" },
};

const POLL_MS = 1_000;

const HEARTBEAT_MS = 30_000;

const START_TIMEOUT_MS = 10_000;

let state: State = { kind: "idle" };

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-returns, anti-slop/no-known-value-widening -- the block below IS the boundary parser the rules ask for: a tool call's input, `$.store` values and the server's JSON arrive as `unknown`, and there is no earlier place to parse them. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The file a call would write, for the three tools that write one; `null` for every other. */
function editedPath(tool: string, input: unknown): string | null {
  if (!isRecord(input)) return null;

  if (tool === "NotebookEdit") {
    return typeof input.notebook_path === "string" ? input.notebook_path : null;
  }

  if (tool !== "Edit" && tool !== "Write") return null;

  return typeof input.file_path === "string" ? input.file_path : null;
}

function parseServerInfo(value: unknown): ServerInfo | null {
  return isRecord(value) &&
    typeof value.port === "number" &&
    typeof value.token === "string" &&
    typeof value.pid === "number"
    ? { port: value.port, token: value.token, pid: value.pid }
    : null;
}

function parseSession(value: unknown): Session | null {
  const server = isRecord(value) ? parseServerInfo(value.server) : null;

  return server !== null &&
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workdir === "string"
    ? { id: value.id, server, workdir: value.workdir }
    : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseBatch(value: unknown): DraftBatch | null {
  return isRecord(value) && typeof value.batch === "number" && typeof value.path === "string"
    ? { batch: value.batch, path: value.path }
    : null;
}

/** A count the store kept across a reload; anything else reads as nothing relayed yet. */
function parseRelayed(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function parsePending(text: string): Pending {
  const value = parseJson(text);

  if (!isRecord(value)) return { kind: "none" };

  if (value.kind === "drafts" && Array.isArray(value.batches)) {
    const batches = value.batches.map(parseBatch).filter((batch) => batch !== null);

    return batches.length === 0 ? { kind: "none" } : { kind: "drafts", batches };
  }

  if (typeof value.version !== "number") return { kind: "none" };

  if (value.kind === "approved" && typeof value.dir === "string") {
    return { kind: "approved", version: value.version, dir: value.dir };
  }

  if (value.kind === "feedback" && typeof value.path === "string") {
    return { kind: "feedback", version: value.version, path: value.path };
  }

  return { kind: "none" };
}

function parseGate(response: HttpResponse): Gate {
  const value = parseJson(response.text);

  if (isRecord(value) && typeof value.version === "number" && typeof value.kept === "boolean") {
    return { version: value.version, kept: value.kept };
  }

  return {
    error:
      isRecord(value) && typeof value.error === "string"
        ? value.error
        : `the vellum review server answered ${response.status}`,
  };
}
/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-returns, anti-slop/no-known-value-widening */

/** Absolute, `.` and `..` folded: a relative path resolves against the session's directory. */
function resolvePath(cwd: string, path: string): string {
  const segments: string[] = [];

  for (const segment of (path.startsWith("/") ? path : `${cwd}/${path}`).split("/")) {
    if (segment === "" || segment === ".") continue;

    if (segment === "..") segments.pop();
    else segments.push(segment);
  }

  return `/${segments.join("/")}`;
}

/**
 * The lock, as a pure function: while vellum plans, the files a call may write are the
 * working directory's, and those it writes outright, since the directory is vellum's own and
 * the page shows every file in it. Every other tool goes to the session's own flow, so
 * exploration and reads are untouched.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- `input` is the call's arguments as `tool.check` hands them over (`ToolCheckInput.input: unknown`); `editedPath`, in the boundary parser above, is what reads them.
export function lockVerdict(tool: string, input: unknown, cwd: string, workdir: string): Verdict {
  const path = editedPath(tool, input);

  if (path === null) return { kind: "check" };

  return resolvePath(cwd, path).startsWith(`${resolvePath(cwd, workdir)}/`)
    ? { kind: "allow" }
    : {
        kind: "deny",
        reason: `vellum is planning: files outside ${workdir} change after the plan is approved`,
      };
}

/** What the model reads from `submit`: `kept` means the browser already shows this very text. */
export function submitResult(gate: Gate): { result: string } | { deny: string } {
  if ("error" in gate) return { deny: gate.error };
  const held = gate.kept ? "is already under review" : "is under review";

  return {
    result: `Plan v${gate.version} ${held} in the browser. End your turn; the review arrives as a prompt.`,
  };
}

function draftsPrompt(batches: readonly DraftBatch[]): string {
  const paths = batches.map((batch) => batch.path).join(", ");

  return `Drafting feedback from the vellum review page: read ${paths}, revise the files they name, then continue the plan.`;
}

function feedbackPrompt(pending: Extract<Pending, { kind: "feedback" }>): string {
  return `Plan review v${pending.version}: changes requested. Read ${pending.path}, revise plan.md and the files it names, then call ${SUBMIT_TOOL} again.`;
}

function approvedPrompt(pending: Extract<Pending, { kind: "approved" }>): string {
  return `Plan v${pending.version} approved. It lives at ${pending.dir}. Implement it here or in a fresh session.`;
}

/** Hands the session a prompt; `false` when another plugin dropped it, so the next tick retries. */
async function submitPrompt($: EngineInterface, text: string): Promise<boolean> {
  const result = await $.prompt.submit({ text });

  if (result.drop === undefined) return true;
  $.ui.log(`vellum: the review prompt was dropped: ${result.drop}`);

  return false;
}

function api(
  $: EngineInterface,
  server: ServerInfo,
  path: string,
  init?: HttpInit,
): Promise<HttpResponse> {
  return $.http.fetch(`http://127.0.0.1:${server.port}${path}`, {
    ...init,
    headers: { "x-vellum-token": server.token, "content-type": "application/json" },
  });
}

async function alive($: EngineInterface, server: ServerInfo): Promise<boolean> {
  try {
    return (await api($, server, "/api/review")).ok;
  } catch {
    return false;
  }
}

function reviewUrl(server: ServerInfo): string {
  return `http://127.0.0.1:${server.port}/t/${server.token}/`;
}

function keepAlive($: EngineInterface, session: Session): Live {
  const heartbeat = $.clock.every(HEARTBEAT_MS, () => {
    void api($, session.server, "/api/heartbeat", { method: "POST" }).catch(() => {});
  });

  return { session, heartbeat };
}

async function startServer(
  $: EngineInterface,
  id: string,
  workdir: string,
): Promise<ServerInfo | null> {
  const argv = [
    "bun",
    `${$.plugin.root}/src/cli.ts`,
    "start",
    "--session",
    id,
    "--project",
    await $.session.cwd(),
    "--workdir",
    workdir,
  ];

  try {
    const run = await $.process.run(argv, { timeoutMs: START_TIMEOUT_MS });

    if (run.exitCode === 0) return parseServerInfo(parseJson(run.stdout));
    $.ui.log(`vellum: the review server did not start: ${run.stderr.trim()}`);
  } catch (cause) {
    $.ui.log(`vellum: the review server did not start: ${String(cause)}`);
  }

  return null;
}

/** The session `$.store` kept across a module reload, when its server still answers. */
async function restored($: EngineInterface, id: string): Promise<Live | null> {
  const stored = parseSession(await $.store.get(`session:${id}`));

  return stored !== null && (await alive($, stored.server)) ? keepAlive($, stored) : null;
}

async function started($: EngineInterface, id: string, workdir: string): Promise<Live | null> {
  const server = await startServer($, id, workdir);

  if (server === null) return null;
  const session = { id, server, workdir };
  await $.store.set(`session:${id}`, session);

  return keepAlive($, session);
}

function stopTimers(): void {
  if (state.kind === "idle") return;
  state.live.heartbeat.cancel();
  state.poll.cancel();
}

function relayedKey(id: string): string {
  return `relayed:${id}`;
}

async function close($: EngineInterface): Promise<void> {
  if (state.kind === "live") {
    const { id } = state.live.session;
    await Promise.all([$.store.delete(`session:${id}`), $.store.delete(relayedKey(id))]);
  }

  stopTimers();
  state = { kind: "idle" };
  $.ui.status(undefined);
}

/**
 * Enters the mode: one poll a second until it closes. Each drafting batch is named once and
 * the count survives a reload in `$.store`; a feedback is relayed once per version; an
 * approval once, and then the mode closes. A dropped prompt or a failed poll is logged and
 * retried on the next tick.
 */
async function enter($: EngineInterface, live: Live): Promise<void> {
  if (state.kind === "live") state.poll.cancel();
  const { id, server } = live.session;
  let relaying = false;
  let drafts = parseRelayed(await $.store.get(relayedKey(id)));
  let version = 0;

  const poll = $.clock.every(POLL_MS, () => {
    if (relaying) return;
    relaying = true;

    void api($, server, "/api/pending")
      .then(async (response) => {
        const pending = parsePending(response.text);

        if (pending.kind === "drafts") {
          const fresh = pending.batches.filter((batch) => batch.batch > drafts);
          const last = fresh.at(-1);

          if (last === undefined || !(await submitPrompt($, draftsPrompt(fresh)))) return;
          drafts = last.batch;
          await $.store.set(relayedKey(id), drafts);

          return;
        }

        if (pending.kind === "feedback") {
          if (pending.version === version || !(await submitPrompt($, feedbackPrompt(pending)))) {
            return;
          }

          version = pending.version;
          $.ui.status("planning");

          return;
        }

        if (pending.kind === "approved" && (await submitPrompt($, approvedPrompt(pending)))) {
          await close($);
        }
      })
      .catch((cause: unknown) => {
        $.ui.log(`vellum: the review poll failed: ${String(cause)}`);
      })
      .finally(() => {
        relaying = false;
      });
  });

  state = { kind: "live", live, poll };
  $.ui.status("planning");
}

/**
 * Reaches a server, in order: the one this session already has when it answers, the one
 * `$.store` kept, a new one. A `/clear` changes the session id, so the live server of another
 * id is left to its heartbeat and a new one takes over.
 */
async function connect($: EngineInterface): Promise<Live | null> {
  const id = await $.session.id();
  const current = state.kind === "idle" ? null : state.live;

  if (current?.session.id === id && (await alive($, current.session.server))) return current;
  stopTimers();
  const date = new Date().toISOString().slice(0, 10);
  const workdir = `plans/${date}/wip-${id.slice(0, 8)}/`;
  const live = (await restored($, id)) ?? (await started($, id, workdir));

  if (live === null) {
    state = { kind: "idle" };

    return null;
  }

  await enter($, live);
  $.ui.log(`vellum: planning in ${live.session.workdir}, ${reviewUrl(live.session.server)}`);

  return live;
}

export const register: Register = (on) => {
  // A fresh environment on every load; spelled out so a test that calls register twice starts clean.
  state = { kind: "idle" };

  on("session.start", async ($, e, next) => {
    await $.tool.register(SUBMIT);
    const live = await restored($, await $.session.id());

    if (live !== null) await enter($, live);

    return next(e);
  });

  on("skill.prompt", { skill: PLAN_SKILL }, async ($, e, next) => {
    const live = await connect($);
    const result = await next(e);

    if (live === null) return result;
    // The page opens on the way in, so the reviewer can comment on the artifacts before v1.
    void api($, live.session.server, "/api/open", { method: "POST" }).catch(() => {});

    return { text: `${result.text}\n\nWorking directory: ${live.session.workdir}` };
  });

  // The way out is a skill, not `$.command.register`: a registered command takes the global
  // namespace, and `disable-model-invocation` keeps this one the reviewer's to run.
  on("skill.prompt", { skill: STOP_SKILL }, async ($, e, next) => {
    const line =
      state.kind === "idle"
        ? "no vellum planning in progress"
        : `vellum planning closed; ${state.live.session.workdir} is kept`;

    await close($);
    const result = await next(e);

    return { text: `${result.text}\n\n${line}` };
  });

  on("tool.check", async ($, e, next) => {
    if (state.kind === "idle") return next(e);
    const { workdir } = state.live.session;
    // ponytail: the lock reads the file tools only, so a shell command the session's own flow
    // approves still writes anywhere; a command classifier is the upgrade if that ever bites.
    const verdict = lockVerdict(e.tool, e.input, await $.session.cwd(), workdir);

    if (verdict.kind === "deny") return { decision: "deny", reason: verdict.reason };

    if (verdict.kind === "allow") return { decision: "allow" };
    const engine = await next(e);

    // A settings allow rule (`Bash(mkdir:*)`) would let a file-modifying command past the lock,
    // as the native plan mode never does: the person decides it instead. The built-in read-only
    // set carries no rule, so `git log` and `ls` still pass.
    return e.tool === "Bash" && engine.decision === "allow" && engine.rule !== undefined
      ? { ...engine, decision: "ask" }
      : engine;
  });

  on("tool.call", { tool: SUBMIT_TOOL }, async ($) => {
    if (state.kind === "idle") return { deny: "no vellum planning in progress; run /vellum:plan" };

    const gate = await api($, state.live.session.server, "/api/gate", {
      method: "POST",
      body: "{}",
    })
      .then(parseGate)
      .catch((): Gate => ({
        error: "the vellum review server is not answering; run /vellum:plan again",
      }));

    if (!("error" in gate)) $.ui.status(`plan v${gate.version} under review`);

    return submitResult(gate);
  });
};
