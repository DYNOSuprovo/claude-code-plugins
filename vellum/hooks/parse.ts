import type { HttpResponse } from "claude-code";

import type { GateAnswer, Pending } from "../src/protocol.ts";
import type { ServerInfo, Session } from "./mode.ts";
import type { Relayed } from "./relay.ts";

declare const brand: unique symbol;

type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type SessionId = Brand<string, "SessionId">;

export type Token = Brand<string, "Token">;

/** Absolute: the directory the review server was started in. */
export type ProjectDir = Brand<string, "ProjectDir">;

/** Relative to the project, trailing slash kept. */
export type Workdir = Brand<string, "Workdir">;

/**
 * A server type as it crosses HTTP: every brand the domain mints falls back to the value it
 * wraps, since the module reads the server's JSON and grants none of the server's brands.
 * A field the server adds or renames fails the parser below, which is what holds the two ends
 * together.
 *
 * `object` is tested first on purpose: a brand is a primitive intersected with an object, so
 * that arm catches it while a bare `kind: "none"` falls through and keeps its literal.
 */
export type Json<T> = T extends object
  ? T extends readonly (infer U)[]
    ? readonly Json<U>[]
    : T extends string
      ? string
      : T extends number
        ? number
        : { readonly [K in keyof T]: Json<T[K]> }
  : T;

export type PendingWire = Json<Pending>;

/** What `POST /api/gate` answers: the version the browser shows, or why it shows none. */
export type GateWire = Json<GateAnswer>;

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-returns, anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion -- this file IS the boundary parser the rules ask for: a tool call's input, `$.store` values and the server's JSON arrive as `unknown`, there is no earlier place to parse them, and the brands above are minted here and nowhere else. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sessionId(raw: string): SessionId {
  return raw as SessionId;
}

export function projectDir(raw: string): ProjectDir {
  return raw as ProjectDir;
}

export function workdirOf(id: SessionId, date: string): Workdir {
  return `plans/${date}/wip-${id.slice(0, 8)}/` as Workdir;
}

/** The file a call would write, for the three tools that write one; `null` for every other. */
export function editedPath(tool: string, input: unknown): string | null {
  if (!isRecord(input)) return null;

  if (tool === "NotebookEdit") {
    return typeof input.notebook_path === "string" ? input.notebook_path : null;
  }

  if (tool !== "Edit" && tool !== "Write") return null;

  return typeof input.file_path === "string" ? input.file_path : null;
}

export function parseServerInfo(value: unknown): ServerInfo | null {
  return isRecord(value) &&
    typeof value.port === "number" &&
    typeof value.token === "string" &&
    typeof value.pid === "number"
    ? { port: value.port, token: value.token as Token, pid: value.pid }
    : null;
}

export function parseSession(value: unknown): Session | null {
  const server = isRecord(value) ? parseServerInfo(value.server) : null;

  return server !== null &&
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.project === "string" &&
    typeof value.workdir === "string"
    ? {
        id: value.id as SessionId,
        server,
        project: value.project as ProjectDir,
        workdir: value.workdir as Workdir,
      }
    : null;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseBatch(value: unknown): Json<Pending & { kind: "drafts" }>["batches"][number] | null {
  return isRecord(value) && typeof value.batch === "number" && typeof value.path === "string"
    ? { batch: value.batch, path: value.path }
    : null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** What the store kept for this working directory; another directory's reads as nothing relayed. */
export function parseRelayed(value: unknown, workdir: Workdir): Relayed {
  return isRecord(value) &&
    value.workdir === workdir &&
    isCount(value.drafts) &&
    isCount(value.version)
    ? { workdir, drafts: value.drafts, version: value.version }
    : { workdir, drafts: 0, version: 0 };
}

export function parsePending(text: string): PendingWire {
  const value = parseJson(text);

  if (!isRecord(value)) return { kind: "none" };

  if (value.kind === "drafts" && Array.isArray(value.batches)) {
    const batches = value.batches.map(parseBatch).filter((batch) => batch !== null);

    return batches.length === 0 ? { kind: "none" } : { kind: "drafts", batches };
  }

  if (typeof value.version !== "number") return { kind: "none" };

  if (
    value.kind === "approved" &&
    typeof value.dir === "string" &&
    (value.notes === null || typeof value.notes === "string")
  ) {
    return { kind: "approved", version: value.version, dir: value.dir, notes: value.notes };
  }

  if (value.kind === "feedback" && typeof value.path === "string") {
    return { kind: "feedback", version: value.version, path: value.path };
  }

  return { kind: "none" };
}

export function parseGate(response: HttpResponse): GateWire {
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
/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-returns, anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion */
