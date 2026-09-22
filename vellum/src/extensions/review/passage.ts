import type { Passage } from "../../core/protocol.ts";
import type { Place } from "./protocol.ts";

/** As many characters of context as `passageFromRange` in `core/page/anchoring.ts` keeps. */
const CONTEXT_CHARS = 32;

/** How far from its stated lines a quote is still taken: the agent misnumbers lines more often than it misquotes. */
const LINE_TOLERANCE = 5;

/**
 * What the page's rendered text never holds: inline markup, and a line break, since a quote over
 * two source lines crosses a block the page renders apart. `rangeFor` would find no such quote.
 */
const UNRENDERED = /[`*[\]\n]/u;

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

function distance(line: number, [first, last]: readonly [number, number]): number {
  return Math.max(first - line, line - last, 0);
}

/**
 * The finding's place in the version's text as a `Passage` the page re-finds with `rangeFor`:
 * the occurrence of the quote nearest its lines, within `LINE_TOLERANCE`, on the line it is
 * really on. `null` when the quote holds markup or is not there.
 */
export function passageOf(text: string, place: Place): Passage | null {
  const { quote } = place;

  if (quote.trim() === "" || UNRENDERED.test(quote)) return null;
  let best: { readonly at: number; readonly line: number; readonly off: number } | null = null;

  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const line = lineAt(text, at);
    const off = distance(line, place.lines);

    if (off <= LINE_TOLERANCE && (best === null || off < best.off)) best = { at, line, off };
  }

  if (best === null) return null;
  const { at, line } = best;

  return {
    kind: "prose",
    quote,
    prefix: text.slice(Math.max(0, at - CONTEXT_CHARS), at),
    suffix: text.slice(at + quote.length, at + quote.length + CONTEXT_CHARS),
    lines: [line, line],
    removed: false,
  };
}
