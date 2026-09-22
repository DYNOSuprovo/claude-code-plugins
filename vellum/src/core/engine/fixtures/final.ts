import type { PendingWire } from "../parse.ts";
import { DATE } from "./date.ts";

export const FINAL = `plans/${DATE}/notification-settings/`;

/** What `GET /api/pending` carries under `pending` once the plan is approved; `notes` is the notes file's path. */
export function approved(
  version: number,
  notes: string | null = null,
): Extract<PendingWire, { kind: "approved" }> {
  return { kind: "approved", version, dir: FINAL, notes };
}
