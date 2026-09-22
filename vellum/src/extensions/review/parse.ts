import type { Finding, Place, ReviewStatus, Size, Verdict } from "./protocol.ts";

/**
 * The boundary of `review`: the verdict is a text the plan reviewer wrote, a model, read here by
 * its lines, once. Every marker is a whole line at the left margin, so the same words inside a
 * finding or an indented quote are text.
 */

const HEADING = "## Plan review";

const STATUS = {
  "Status: Approved": "approved",
  "Status: Issues found": "issuesFound",
} as const satisfies Record<string, ReviewStatus>;

const SIZE = /^Verdict: (overengineered|underengineered|right) [-–—] (.+)$/u;

const LISTS = { "Issues:": "issues", "Advisory (does not block):": "advisories" } as const;

const ITEM = /^- (?:\[([^\]]+)\] )?(.+)$/u;

const QUOTE = /^\s+> ?(.*)$/u;

/** A wrapped line or a nested point: indented, it belongs to the finding above it. */
const CONTINUED = /^\s+(\S.*)$/u;

/** The format is shown in a fence, and the agent may copy it. */
const FENCE = /^(?:`{3,}|~{3,})\S*$/u;

const LINES = /^lines? (\d+)(?:\s*[-–—]\s*(\d+))?: (.+)$/iu;

type List = (typeof LISTS)[keyof typeof LISTS];

type Item = {
  readonly section: string | null;
  readonly rest: string;
  readonly more: string[];
  readonly quote: string[];
};

function isSize(value: string | undefined): value is Size {
  return value === "overengineered" || value === "underengineered" || value === "right";
}

function isStatus(line: string): line is keyof typeof STATUS {
  return Object.hasOwn(STATUS, line);
}

function isList(line: string): line is keyof typeof LISTS {
  return Object.hasOwn(LISTS, line);
}

/** Anchored when the item names its lines and a quote follows it; otherwise its text as written. */
function findingOf({ section, rest, more, quote }: Item): Finding {
  const [, start, end, text] = LINES.exec(rest) ?? [];
  const first = Number(start);
  const last = end === undefined ? first : Number(end);

  if (quote.length === 0 || text === undefined || first < 1 || last < first) {
    const quoted = quote.map((line) => `\n> ${line}`).join("");

    return { section, text: `${[rest, ...more].join("\n")}${quoted}`, place: null };
  }

  const place: Place = { lines: [first, last], quote: quote.join("\n") };

  return { section, text: [text, ...more].join("\n"), place };
}

/** `null` for a text that is not a whole verdict: no heading, a status or a size missing or twice, a line the format does not name. */
export function parseVerdict(text: string): Verdict | null {
  const lines = text.split("\n").map((line) => line.trimEnd());
  const start = lines.indexOf(HEADING);

  if (start === -1) return null;
  let status: ReviewStatus | null = null;
  let size: Verdict["size"] | null = null;
  let list: List | null = null;
  const items: Record<List, Item[]> = { issues: [], advisories: [] };

  for (const line of lines.slice(start + 1)) {
    const quote = QUOTE.exec(line);
    const continued = CONTINUED.exec(line);
    const item = ITEM.exec(line);
    const [, kind, why] = SIZE.exec(line) ?? [];
    const last = list === null ? undefined : items[list].at(-1);

    if (line === "" || FENCE.test(line)) continue;

    if (isStatus(line) && status === null) status = STATUS[line];
    else if (isSize(kind) && why !== undefined && size === null) size = { kind, why };
    else if (isList(line)) list = LISTS[line];
    else if (quote !== null && last !== undefined) last.quote.push(quote[1] ?? "");
    else if (continued !== null && last !== undefined) last.more.push(continued[1] ?? "");
    else if (item !== null && list !== null) {
      items[list].push({ section: item[1] ?? null, rest: item[2] ?? "", more: [], quote: [] });
    } else return null;
  }

  if (status === null || size === null) return null;

  return {
    status,
    size,
    issues: items.issues.map((item) => findingOf(item)),
    advisories: items.advisories.map((item) => findingOf(item)),
  };
}
