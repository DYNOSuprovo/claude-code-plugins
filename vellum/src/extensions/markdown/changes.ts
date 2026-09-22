import type { Element, Root } from "hast";

import { parseLines } from "../../core/page/anchoring.ts";
import type { DiffRun, LineDiff } from "../../core/protocol.ts";

/**
 * What "Changes since" draws over the rendered plan: which blocks carry the green bar, and
 * where each removed run shows its old source. Pure, over the hast of `tree.ts`.
 */

export type RemovedRun = Extract<DiffRun, { readonly kind: "removed" }>;

/**
 * A removed run is drawn before the block that follows it, with one exception a `details`
 * forces: no child of a list, it goes inside the item, after its checkbox when it has one. Before
 * a row it is drawn as a row of its own, which the renderer makes. A code block also says which
 * of its lines were added, by their index in the block.
 */
export type Changes = {
  readonly marked: ReadonlySet<Element>;
  readonly addedLines: ReadonlyMap<Element, readonly number[]>;
  readonly removedBefore: ReadonlyMap<Element, readonly RemovedRun[]>;
  readonly removedInside: ReadonlyMap<Element, readonly RemovedRun[]>;
  readonly removedAtEnd: readonly RemovedRun[];
};

export function removedLabel(count: number): string {
  return `${count} ${count === 1 ? "line" : "lines"} removed`;
}

export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "tr",
  "blockquote",
  "hr",
]);

type Block = {
  readonly element: Element;
  readonly start: number;
  readonly end: number;
  /** A loose item's only paragraph hands its mark to the item, so the item looks the same tight or loose. */
  readonly marks: Element;
};

/** The blocks under `node` in document order, each with its own `data-lines`: an `li` stops before its nested list. */
function blocksOf(node: Root | Element, parent: Block | null): Block[] {
  return node.children.flatMap((child) => {
    if (child.type !== "element") return [];
    const lines = parseLines(String(child.properties.dataLines));

    if (lines === null || !BLOCK_TAGS.has(child.tagName)) return blocksOf(child, null);
    const [start, end] = lines;

    const item =
      child.tagName === "p" &&
      parent?.element.tagName === "li" &&
      parent.start === start &&
      parent.end === end
        ? parent.element
        : null;

    const block = { element: child, start, end, marks: item ?? child };

    return [block, ...blocksOf(child, block)];
  });
}

function add<T>(to: Map<Element, T[]>, anchor: Element, item: T): void {
  to.set(anchor, [...(to.get(anchor) ?? []), item]);
}

export function changesOf(tree: Root, diff: LineDiff): Changes {
  const blocks = blocksOf(tree, null);
  const marked = new Set<Element>();
  const addedLines = new Map<Element, number[]>();
  const removedBefore = new Map<Element, RemovedRun[]>();
  const removedInside = new Map<Element, RemovedRun[]>();
  const removedAtEnd: RemovedRun[] = [];

  for (const run of diff) {
    if (run.kind === "added") {
      for (let line = run.after; line < run.after + run.count; line += 1) {
        const innermost = blocks.findLast((block) => block.start <= line && line <= block.end);

        if (innermost === undefined) continue;
        marked.add(innermost.marks);

        if (innermost.element.tagName === "pre") {
          const fence = innermost.element.properties.dataFenced === true ? 1 : 0;
          const first = innermost.start + fence;

          if (line >= first && line <= innermost.end - fence) {
            add(addedLines, innermost.element, line - first);
          }
        }
      }
    }

    if (run.kind === "removed") {
      const anchor = blocks.find(
        (block) => block.element.tagName !== "blockquote" && block.end >= run.at,
      );

      if (anchor === undefined) removedAtEnd.push(run);
      else if (anchor.element.tagName === "li") add(removedInside, anchor.element, run);
      else add(removedBefore, anchor.element, run);
    }
  }

  return { marked, addedLines, removedBefore, removedInside, removedAtEnd };
}
