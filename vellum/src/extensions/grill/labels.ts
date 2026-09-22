import type { CloseReason } from "./protocol.ts";

/** What the transcript's foot says of its end, in the reviewer's words; the file keeps the reason's code. */
export function footerOf(reason: CloseReason | "approved"): string {
  switch (reason) {
    case "page":
      return "Ended by you";
    case "stop":
      return "Ended by /vellum:stop";
    case "approved":
      return "Ended at approval";
  }
}
