import { bestOffset, CONTEXT_CHARS } from "../../core/page/anchoring.ts";
import type { WordsContext } from "../../core/protocol.ts";

/**
 * Words dragged in a mockup's element, placed by their context and found again whatever the
 * whitespace became. `raw` is the element's text as its text nodes hold it; every offset is in it.
 */

/** A click picks the whole element: no words to place. */
export const CLICK_CONTEXT: WordsContext = { prefix: "", suffix: "", repeated: false };

/** What a comment quotes of `text`: every run of whitespace one space, none at the ends. */
export function quoted(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

/** A text with every run of whitespace one space, and the offset in the raw text of each of its characters. */
type Collapsed = { readonly text: string; readonly from: readonly number[] };

function collapsed(raw: string): Collapsed {
  const from: number[] = [];
  let text = "";
  let inRun = false;

  for (let at = 0; at < raw.length; at += 1) {
    const char = raw.charAt(at);
    const space = /\s/u.test(char);

    if (!space || !inRun) {
      text += space ? " " : char;
      from.push(at);
    }

    inRun = space;
  }

  return { text, from };
}

/** The context of the words dragged from `start` to `end` of `raw`. */
export function contextOf(raw: string, start: number, end: number): WordsContext {
  const { text, from } = collapsed(raw);
  const quote = quoted(raw.slice(start, end));
  const at = text.indexOf(quote, from.filter((offset) => offset < start).length);

  return {
    prefix: text.slice(Math.max(0, at - CONTEXT_CHARS), at),
    suffix: text.slice(at + quote.length, at + quote.length + CONTEXT_CHARS),
    repeated: text.indexOf(quote) !== at || text.includes(quote, at + 1),
  };
}

/** Where `words` sit in `raw`, the occurrence whose context fits best; `null` once they are gone. */
export function wordsIn(
  raw: string,
  words: string,
  context: WordsContext,
): readonly [number, number] | null {
  // A click on an element with no text quotes nothing, and nothing is found in every place at once.
  if (words === "") return null;
  const { text, from } = collapsed(raw);
  const at = bestOffset(text, { quote: words, prefix: context.prefix, suffix: context.suffix });
  const first = at === null ? undefined : from[at];
  const last = at === null ? undefined : from[at + words.length - 1];

  return first === undefined || last === undefined ? null : [first, last + 1];
}
