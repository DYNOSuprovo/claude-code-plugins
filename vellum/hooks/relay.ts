import type { Host } from "./host.ts";
import type { Live } from "./mode.ts";
import type { GateWire, PendingWire, SessionId, Workdir } from "./parse.ts";
import type { Unchanged } from "./server.ts";

// Named here for the feedback prompt; `register.ts` writes the matcher as a literal, since the
// loader reads matchers from that file's source and cannot follow an import.
const SUBMIT_TOOL = "mcp__vellum__submit";

/**
 * What `$.store` keeps under `relayed:<id>`: how many drafting batches and which feedback
 * version the poll already named, for one working directory. Batch numbers restart with the
 * directory, so a count kept for another one is worth nothing.
 */
export type Relayed = {
  readonly workdir: Workdir;
  readonly drafts: number;
  readonly version: number;
};

/** What one poll settled: what has been named now, and whether the plan was approved. */
export type Ticked = { readonly relayed: Relayed; readonly approved: boolean };

export function relayedKey(id: SessionId): string {
  return `relayed:${id}`;
}

function draftsPrompt(batches: Extract<PendingWire, { kind: "drafts" }>["batches"]): string {
  const paths = batches.map((batch) => batch.path).join(", ");

  return `Drafting feedback from the vellum review page: read ${paths}, revise the files they name, then continue the plan.`;
}

function feedbackPrompt(pending: Extract<PendingWire, { kind: "feedback" }>): string {
  return `Plan review v${pending.version}: changes requested. Read ${pending.path}, revise plan.md and the files it names, then call ${SUBMIT_TOOL} again.`;
}

function approvedPrompt(pending: Extract<PendingWire, { kind: "approved" }>): string {
  const notes = pending.notes === null ? "" : ` Read ${pending.notes} first: the reviewer's notes.`;

  return `Plan v${pending.version} approved.${notes} It lives at ${pending.dir}. Implement it here or in a fresh session.`;
}

/**
 * Submits `plan.md` and says where it stands. A recorded version is announced under the prompt
 * and in the transcript; a kept one changes nothing; a refusal (no `plan.md` yet, the plan
 * approved) is the caller's to read; a server that does not answer is a rejection.
 */
export async function submitPlan(host: Host, live: Live, unchanged: Unchanged): Promise<GateWire> {
  const gate = await live.server.gate(unchanged);

  if ("error" in gate || gate.kept) return gate;
  host.status(`plan v${gate.version} under review`);
  host.log(`plan v${gate.version} is under review in the browser`);

  return gate;
}

/** What the model reads from `submit`: `kept` means the browser already shows this very text. */
export function submitResult(gate: GateWire): { result: string } | { deny: string } {
  if ("error" in gate) return { deny: gate.error };
  const held = gate.kept ? "is already under review" : "is under review";

  return {
    result: `Plan v${gate.version} ${held} in the browser. End your turn; the review arrives as a prompt.`,
  };
}

/** Hands the session a prompt; `false` when another plugin dropped it, so the next tick retries. */
async function submitPrompt(host: Host, text: string): Promise<boolean> {
  const result = await host.submitPrompt(text);

  if (result.drop === undefined) return true;
  host.log(`the review prompt was dropped: ${result.drop}`);

  return false;
}

/** A store that refuses the record is logged, not obeyed: the prompt went out, once. */
async function remember(host: Host, id: SessionId, next: Relayed): Promise<Relayed> {
  await host.storeSet(relayedKey(id), next).catch((cause: unknown) => {
    host.log(`the relayed record was not kept: ${String(cause)}`);
  });

  return next;
}

/**
 * One poll. Each drafting batch is named once and each feedback version once, remembered in
 * `$.store` so a reload or a restarted server repeats neither; an approval once, and then the
 * record goes, since the next plan starts a directory of its own.
 */
export async function tick(host: Host, live: Live, relayed: Relayed): Promise<Ticked> {
  const pending = await live.server.pending();
  const { id } = live.session;
  const kept: Ticked = { relayed, approved: false };

  if (pending.kind === "drafts") {
    const fresh = pending.batches.filter((batch) => batch.batch > relayed.drafts);
    const last = fresh.at(-1);

    if (last === undefined || !(await submitPrompt(host, draftsPrompt(fresh)))) return kept;

    return {
      relayed: await remember(host, id, { ...relayed, drafts: last.batch }),
      approved: false,
    };
  }

  if (pending.kind === "feedback") {
    if (
      pending.version === relayed.version ||
      !(await submitPrompt(host, feedbackPrompt(pending)))
    ) {
      return kept;
    }

    const next = await remember(host, id, { ...relayed, version: pending.version });
    host.status("planning");

    return { relayed: next, approved: false };
  }

  if (pending.kind === "approved" && (await submitPrompt(host, approvedPrompt(pending)))) {
    await host.storeDelete(relayedKey(id)).catch((cause: unknown) => {
      host.log(`the relayed record was not dropped: ${String(cause)}`);
    });

    return { relayed, approved: true };
  }

  return kept;
}
