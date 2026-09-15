export type TargetKind = "block" | "inline" | "code" | "table" | "row" | "cell";

export type TableEdge = "inside" | "side" | "topOrBottom";

export type Pick = { readonly index: number; readonly kind: TargetKind };

export type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

const TABLE_EDGE_PX = 22;

export function tableEdge(x: number, y: number, box: Box): TableEdge {
  if (y - box.top < TABLE_EDGE_PX || box.bottom - y < TABLE_EDGE_PX) return "topOrBottom";

  if (x - box.left < TABLE_EDGE_PX || box.right - x < TABLE_EDGE_PX) return "side";

  return "inside";
}

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
export function pickTarget(tags: readonly string[], edge: TableEdge): Pick | null {
  const pre = tags.indexOf("pre");

  if (pre !== -1) return { index: pre, kind: "code" };
  const table = tags.indexOf("table");
  const row = tags.indexOf("tr");

  if (table !== -1 && edge === "side" && row !== -1) return { index: row, kind: "row" };

  if (table !== -1 && edge !== "inside") return { index: table, kind: "table" };
  const inline = tags.findIndex((tag) => INLINES.has(tag));

  if (inline !== -1) return { index: inline, kind: "inline" };
  const cell = tags.findIndex((tag) => tag === "td" || tag === "th");

  if (cell !== -1) return { index: cell, kind: "cell" };

  if (table !== -1) return { index: table, kind: "table" };
  const block = tags.findIndex((tag) => BLOCKS.has(tag));

  return block === -1 ? null : { index: block, kind: "block" };
}

function labelOf(element: HTMLElement): string {
  if (element instanceof HTMLPreElement) {
    const language = /language-(\S+)/u.exec(element.querySelector("code")?.className ?? "")?.[1];

    return language === undefined ? "code block" : `code block (${language})`;
  }

  if (element instanceof HTMLTableRowElement) return `table row ${element.rowIndex + 1}`;

  if (
    element instanceof HTMLTableCellElement &&
    element.parentElement instanceof HTMLTableRowElement
  ) {
    return `table cell ${element.parentElement.rowIndex + 1}·${element.cellIndex + 1}`;
  }

  const tag = element.tagName.toLowerCase();

  return tag === "table" ? "table" : (INLINES.get(tag) ?? BLOCKS.get(tag) ?? "");
}

/** The target under the pointer at `x`, `y`: `from` is the event's element, `root` the article. */
export function targetAt(root: HTMLElement, from: Element, x: number, y: number): Target | null {
  if (!root.contains(from)) return null;
  const path: HTMLElement[] = [];

  for (let at: Element | null = from; at !== null && at !== root; at = at.parentElement) {
    if (at instanceof HTMLElement) path.push(at);
  }

  const table = path.find((element) => element instanceof HTMLTableElement);

  const pick = pickTarget(
    path.map((element) => element.tagName.toLowerCase()),
    table === undefined ? "inside" : tableEdge(x, y, table.getBoundingClientRect()),
  );

  const element = pick === null ? undefined : path[pick.index];

  return pick === null || element === undefined
    ? null
    : { element, kind: pick.kind, label: labelOf(element) };
}

/** The box of `target` on screen; a list item's box widens over its marker, which sits in the list's padding. */
export function boxOf(target: Target): DOMRect {
  const rect = target.element.getBoundingClientRect();
  const list = target.element.parentElement;

  if (!(target.element instanceof HTMLLIElement) || list === null) return rect;
  const left = list.getBoundingClientRect().left;

  return new DOMRect(left, rect.top, rect.right - left, rect.height);
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
