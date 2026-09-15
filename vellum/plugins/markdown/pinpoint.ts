export type TargetKind = "block" | "inline" | "code" | "table" | "row" | "cell";

export type TableEdge = "inside" | "side" | "topOrBottom";

export type Pick = { readonly index: number; readonly kind: TargetKind };

export type Target = {
  readonly element: HTMLElement;
  readonly kind: TargetKind;
  readonly label: string;
};

const BLOCKS: ReadonlyMap<string, string> = new Map([
  ["p", "paragraph"],
  ["h1", "heading"],
  ["h2", "heading"],
  ["h3", "heading"],
  ["h4", "heading"],
  ["h5", "heading"],
  ["h6", "heading"],
  ["li", "list item"],
  ["blockquote", "quote"],
]);

const INLINES: ReadonlyMap<string, string> = new Map([
  ["strong", "bold"],
  ["em", "italic"],
  ["a", "link"],
  ["code", "code"],
]);

/** `tags`: lower-case tag names from the pointer's element up to the article, innermost first, the article excluded. */
export function pickTarget(tags: readonly string[], _edge: TableEdge): Pick | null {
  const pre = tags.indexOf("pre");

  if (pre !== -1) return { index: pre, kind: "code" };
  const inline = tags.findIndex((tag) => INLINES.has(tag));

  if (inline !== -1) return { index: inline, kind: "inline" };
  const block = tags.findIndex((tag) => BLOCKS.has(tag));

  return block === -1 ? null : { index: block, kind: "block" };
}

function labelOf(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();

  if (tag === "pre") {
    const language = /language-(\S+)/u.exec(element.querySelector("code")?.className ?? "")?.[1];

    return language === undefined ? "code block" : `code block (${language})`;
  }

  return INLINES.get(tag) ?? BLOCKS.get(tag) ?? "";
}

/** The target under the pointer: `from` is the event's element, `root` the article. */
export function targetAt(root: HTMLElement, from: Element): Target | null {
  if (!root.contains(from)) return null;
  const path: HTMLElement[] = [];

  for (let at: Element | null = from; at !== null && at !== root; at = at.parentElement) {
    if (at instanceof HTMLElement) path.push(at);
  }

  const pick = pickTarget(
    path.map((element) => element.tagName.toLowerCase()),
    "inside",
  );

  const element = pick === null ? undefined : path[pick.index];

  return pick === null || element === undefined
    ? null
    : { element, kind: pick.kind, label: labelOf(element) };
}

/** The text of `target` as a range; a list item stops before its nested list. */
export function rangeOf(target: Target): Range | null {
  const { element } = target;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const nested =
      element.tagName === "LI" && element.contains(node.parentElement?.closest("ul, ol") ?? null);

    if (!nested && (node.textContent ?? "").trim() !== "") nodes.push(node);
  }

  const first = nodes[0];
  const last = nodes.at(-1);

  if (first === undefined || last === undefined) return null;
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.textContent?.trimEnd().length ?? 0);

  return range;
}
