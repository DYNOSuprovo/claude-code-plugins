import type { PendingWire, WorkspaceWire } from "../parse.ts";
import { WORKDIR } from "./workdir.ts";

export const DRAFTING: WorkspaceWire = { kind: "drafting", dir: WORKDIR, batches: 0 };

export function inReview(version: number): WorkspaceWire {
  return { kind: "inReview", dir: WORKDIR, version, batches: 0, finalizeError: null };
}

export function changesRequested(version: number): WorkspaceWire {
  return { kind: "changesRequested", dir: WORKDIR, version };
}

export const NOTHING_PENDING: PendingWire = { kind: "none" };

/** What `GET /api/pending` answers: what the module relays, and the workspace the band draws. */
export function polled(pending: PendingWire, workspace: WorkspaceWire = DRAFTING) {
  return { pending, workspace };
}
