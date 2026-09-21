/**
 * What the sheet prints instead of the document; `null` once the document is there. The banner
 * says the failure, the sheet says the state it leaves: a first load that failed stops waiting,
 * and a reload that failed keeps the text a reviewer is reading.
 */
export function waitingText(loaded: boolean, failed: boolean): string | null {
  if (loaded) return null;

  return failed ? "This document could not be loaded." : "Loading…";
}
