import type { Element as HastElement, RootContent } from "hast";
import type { ComponentChild } from "preact";
import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { RendererProps, PageExtension } from "../../core/extension.ts";
import { passageFromRange, rangeFor } from "../../core/page/anchoring.ts";
import { docUrl, fileUrl } from "../../core/page/api.ts";
import { Composer } from "../../core/page/composer.tsx";
import { paint } from "../../core/page/highlights.ts";
import { srgb } from "../../core/page/kit.tsx";
import type { Rect } from "../../core/page/place.ts";
import { dragRange, toggled } from "../../core/page/selection.ts";
import { commenting, dark, docs, error, holding, review, select } from "../../core/page/state.ts";
import type { DocRef, Passage } from "../../core/protocol.ts";
import { parseProjectPath } from "../../core/server/domain/paths.ts";
import type { Changes, RemovedRun } from "./changes.ts";
import { changesOf, removedLabel } from "./changes.ts";
import { linkedDoc } from "./links.ts";
import { markedIndices } from "./marked.ts";
import type { Target } from "./pinpoint.ts";
import { boxOf, diagramPassage, targetAt, targetRange } from "./pinpoint.ts";
import { waitingText } from "./sheet.ts";
import { toTree } from "./tree.ts";

function attributeName(property: string): string {
  if (property === "className") return "class";

  return property.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * A URL of the document, as the page may use it: a project-relative path becomes a files route
 * and keeps its path in `data-path`; an absolute URL with a safe scheme stays; anything else
 * (`javascript:`, `data:`) is dropped. Markdown is the model's text, not the reviewer's.
 */
function urlAttributes(value: string): readonly (readonly [string, string])[] {
  const scheme = /^([a-z][a-z0-9+.-]*:)/iu.exec(value)?.[1]?.toLowerCase();

  if (scheme !== undefined) {
    return SAFE_SCHEMES.has(scheme) ? [["href", value]] : [];
  }

  if (value.startsWith("#")) return [["href", value]];
  const path = parseProjectPath(value.split(/[#?]/u)[0] ?? "");

  return path.ok
    ? [
        ["href", fileUrl(path.value)],
        ["data-path", path.value],
      ]
    : [];
}

/** The source of a mermaid block, when `node` is the `pre` holding one. */
function mermaidSource(node: HastElement): string | null {
  const code = node.tagName === "pre" ? node.children[0] : undefined;
  const classes = code?.type === "element" ? code.properties.className : undefined;

  if (!Array.isArray(classes) || !classes.includes("language-mermaid")) return null;
  const text = code?.type === "element" ? code.children[0] : undefined;

  return text?.type === "text" ? text.value : null;
}

/**
 * A removed run, folded. Its label and its old source are attributes CSS draws, as the Mermaid
 * figure keeps its source: with no text node it takes no selection and no quote search finds it.
 */
function removedBlock(run: RemovedRun): ComponentChild {
  return h(
    "details",
    { key: `removed-${run.before}`, class: "removed" },
    h("summary", { "data-label": removedLabel(run.lines.length) }),
    h("div", { "data-source": run.lines.join("\n") }),
  );
}

function toVNodes(nodes: readonly RootContent[], changes: Changes | null): ComponentChild[] {
  return nodes.flatMap((node, index) => [
    ...(node.type === "element" ? (changes?.removedBefore.get(node) ?? []) : []).map((run) =>
      removedBlock(run),
    ),
    toVNode(node, index, changes),
  ]);
}

/** hast to preact, by hand: the JSX runtime adapters type against a global JSX namespace this page does not own. */
function toVNode(node: RootContent, key: number, changes: Changes | null): ComponentChild {
  if (node.type === "text") return node.value;

  if (node.type !== "element") return null;
  const source = mermaidSource(node);
  const added = changes?.marked.has(node) === true;

  if (source !== null) {
    return h("figure", {
      key,
      class: added ? "mermaid added" : "mermaid",
      "data-lines": String(node.properties.dataLines),
      "data-source": source,
    });
  }

  const attributes: readonly (readonly [string, string])[] = Object.entries(
    node.properties,
  ).flatMap(([name, value]) => {
    if (value === undefined || value === null || value === false) return [];
    const text = Array.isArray(value) ? value.join(" ") : value === true ? "" : String(value);

    if (name === "href" || name === "src") {
      return urlAttributes(text).map(([attribute, url]) => [
        attribute === "href" ? name : attribute,
        url,
      ]);
    }

    return [[attributeName(name), text]];
  });

  const extra = node.tagName === "a" ? { target: "_blank", rel: "noopener" } : {};
  const given = Object.fromEntries(attributes);
  const mark = added ? { class: `${given.class ?? ""} added`.trimStart() } : {};

  const inside = (changes?.removedInside.get(node) ?? []).map((run) => removedBlock(run));

  return h(
    node.tagName,
    { key, ...extra, ...given, ...mark },
    ...inside,
    ...toVNodes(node.children, changes),
  );
}

type Chosen = { readonly range: Range; readonly passage: Passage };

/** The chosen places, and the last one's box in the pane's scrolled content, where the composer is placed near. */
type Draft = {
  readonly chosen: readonly [Chosen, ...Chosen[]];
  readonly target: Rect;
};

type Wash = { readonly target: Target } & Rect;

/** `rect`, from the viewport into the scrolled content of the pane around `root`. */
function inPane(root: HTMLElement, rect: DOMRect): Rect | null {
  const pane = root.parentElement;

  if (pane === null) return null;
  const paneRect = pane.getBoundingClientRect();

  return {
    top: rect.top - paneRect.top + pane.scrollTop,
    left: rect.left - paneRect.left + pane.scrollLeft,
    width: rect.width,
    height: rect.height,
  };
}

/** The pane's window, in its own scrolled content: what the composer must stay inside. */
function paneWindow(root: HTMLElement): Rect | null {
  const pane = root.parentElement;

  return pane === null
    ? null
    : {
        top: pane.scrollTop,
        left: pane.scrollLeft,
        width: pane.clientWidth,
        height: pane.clientHeight,
      };
}

function draftOf(
  root: HTMLElement,
  chosen: readonly [Chosen, ...Chosen[]],
  rect: DOMRect,
): Draft | null {
  const target = inPane(root, rect);

  return target === null ? null : { chosen, target };
}

/** The block holding `passage`, made focusable: where the focus goes once the composer closes. */
function focusPassage(root: HTMLElement, passage: Passage): void {
  const start = rangeFor(root, passage)?.startContainer ?? null;
  const from = start instanceof Element ? start : (start?.parentElement ?? null);

  const block =
    from?.closest<HTMLElement>("[data-lines]") ??
    [...root.querySelectorAll<HTMLElement>("[data-lines]")].find(
      (candidate) => candidate.dataset.lines === passage.lines.join("-"),
    );

  if (block === undefined || block === null) return;
  block.tabIndex = -1;
  block.focus({ preventScroll: true });
}

/** Mermaid removes any element carrying the id it renders under: one counter for the whole page, not one per pane. */
let diagrams = 0;

/** Mermaid draws in the page after the mount; its bundle loads on the first diagram only. */
async function drawDiagrams(root: HTMLElement, night: boolean): Promise<void> {
  const figures = [...root.querySelectorAll<HTMLElement>("figure.mermaid")];
  const [first] = figures;

  if (first === undefined) return;
  const { default: mermaid } = await import("mermaid");
  const { fontFamily, fontSize } = getComputedStyle(first);
  const sheet = srgb("--sheet");
  const tint = srgb("--tint");
  const ink = srgb("--ink");
  const graphite = srgb("--graphite");

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    // A failed render throws before it cleans up: the figure shows the error, and body stays clean.
    suppressErrorRendering: true,
    theme: "base",
    themeVariables: {
      // The base theme derives what is not given here (an ER row, a colour scale) toward light unless told.
      darkMode: night,
      background: sheet,
      mainBkg: tint,
      primaryColor: tint,
      primaryTextColor: ink,
      primaryBorderColor: graphite,
      secondaryColor: sheet,
      tertiaryColor: sheet,
      nodeBorder: graphite,
      lineColor: graphite,
      textColor: ink,
      clusterBkg: sheet,
      clusterBorder: srgb("--rule"),
      edgeLabelBackground: sheet,
      titleColor: ink,
      // The base theme's shadow is a grey literal: a halo on the dark sheet.
      dropShadow: "none",
      fontFamily,
      fontSize,
    },
  });

  for (const figure of figures) {
    const source = figure.dataset.source ?? "";
    diagrams += 1;

    try {
      const { svg } = await mermaid.render(`vellum-diagram-${diagrams}`, source);

      if (figure.dataset.source === source) figure.innerHTML = svg;
    } catch (cause) {
      const text = document.createElement("pre");
      const failure = document.createElement("p");
      text.textContent = source;
      failure.className = "diagram-error";
      failure.textContent = String(cause);
      figure.replaceChildren(text, failure);
    }
  }
}

/** A diagram stands for its source block; every other target for the text it shows. */
function passageOf(root: HTMLElement, target: Target, range: Range): Passage | null {
  return target.kind === "diagram"
    ? diagramPassage(target.element.dataset.lines, target.element.dataset.source)
    : passageFromRange(root, range);
}

/**
 * Off, a link to a document the page holds switches the view, and any other link opens in a new
 * tab. On, a click on a link picks it.
 */
function onClick(event: MouseEvent): void {
  if (commenting.value) return;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const wanted = link?.dataset.path;

  if (wanted === undefined) return;
  const target = linkedDoc(wanted, docs.value, review.value?.plan ?? null);

  if (target === null) return;
  event.preventDefault();
  select(target);
}

/** The document's text, or `null` with the failure in the banner: an error page is not the document. */
async function sourceOf(doc: DocRef): Promise<string | null> {
  try {
    const response = await fetch(docUrl(doc));

    if (response.ok) return await response.text();
    error.value = `GET ${doc.path} failed: ${response.status}`;
  } catch (cause) {
    error.value = `GET ${doc.path} failed: ${String(cause)}`;
  }

  return null;
}

function MarkdownDoc(props: RendererProps): preact.JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [drafted, setDraft] = useState<Draft | null>(null);
  const on = commenting.value;
  // A switch turned off, or a page that locks, under an open composer closes it: its comment
  // could not be added.
  const draft = on ? drafted : null;
  const [wash, setWash] = useState<Wash | null>(null);
  const container = useRef<HTMLElement>(null);
  // The click that ends a drag, which picks nothing whether the drag made a place or not.
  const swallow = useRef(false);

  const shown = props.source ?? text;

  const content = useMemo(() => {
    if (shown === null) return null;
    const tree = toTree(shown);
    const changes = props.changes === null ? null : changesOf(tree, props.changes);

    const atEnd = (changes?.removedAtEnd ?? []).map((run) => removedBlock(run));

    return [...toVNodes(tree.children, changes), ...atEnd];
  }, [shown, props.changes]);

  useEffect(() => {
    void sourceOf(props.doc).then((source) => {
      setFailed(source === null);

      if (source !== null) setText(source);
    });
  }, [props.doc.path, props.doc.modified]);

  useEffect(() => {
    const root = container.current;

    if (root === null || content === null) return;

    const rangesOf = (passages: readonly Passage[]): Range[] =>
      passages.flatMap((passage) => {
        const range = rangeFor(root, passage);

        return range === null ? [] : [range];
      });

    /** A diagram is boxed where text is highlighted: its passage quotes source the SVG lacks. */
    const box = (name: string, passages: readonly Passage[]): void => {
      const lines = new Set(passages.map((passage) => passage.lines.join("-")));

      for (const figure of root.querySelectorAll<HTMLElement>("figure.mermaid")) {
        figure.classList.toggle(name, lines.has(figure.dataset.lines ?? ""));
      }
    };

    /** The block holding a commented passage carries a fillet in the sheet's margin. */
    const fillet = (passages: readonly Passage[]): void => {
      const blocks = [...root.querySelectorAll<HTMLElement>("[data-lines]")];

      const marked = markedIndices(
        blocks.map((block) => ({
          tag: block.tagName.toLowerCase(),
          lines: block.dataset.lines ?? "",
        })),
        passages.map((passage) => passage.lines),
      );

      blocks.forEach((block, index) => block.classList.toggle("marked", marked.has(index)));
    };

    const commented = props.annotations.flatMap((annotation) =>
      annotation.anchor.kind === "text" ? annotation.anchor.passages : [],
    );

    const picked = (draft?.chosen ?? []).map((one) => one.passage);

    paint("vellum-comment", rangesOf(commented));
    paint("vellum-draft", rangesOf(picked));
    box("commented", commented);
    box("picked", picked);
    fillet(commented);

    return () => {
      paint("vellum-comment", []);
      paint("vellum-draft", []);
      box("commented", []);
      box("picked", []);
      fillet([]);
    };
  }, [props.annotations, draft, content]);

  const night = dark.value;

  useEffect(() => {
    const root = container.current;

    if (root !== null) void drawDiagrams(root, night);
  }, [content, night]);

  // A position is taken from a rect once: whatever reflows the sheet (the comments panel folding,
  // the window, a diagram drawn late) leaves it pointing at other text, so it is taken again.
  useEffect(() => {
    const root = container.current;

    if (root === null) return;

    const observer = new ResizeObserver(() => {
      setWash(null);
      setDraft((current) => {
        const last = current?.chosen.at(-1);

        // A place is never chosen collapsed: a collapsed one lost its text to a reload of the file.
        return current === null || last === undefined || last.range.collapsed
          ? current
          : draftOf(root, current.chosen, last.range.getBoundingClientRect());
      });
    });

    observer.observe(root);

    return () => observer.disconnect();
  }, [content === null]);

  // Cleared, not only hidden: a switch turned back on would reopen the old composer.
  useEffect(() => {
    if (on) return;
    setDraft(null);
    setWash(null);
  }, [on]);

  const choose = (root: HTMLElement, one: Chosen, event: MouseEvent): void => {
    const adding = (event.ctrlKey || event.metaKey) && draft !== null;
    const [first, ...rest] = adding && draft !== null ? toggled(draft.chosen, one) : [one];
    const last = rest.at(-1) ?? first;

    setDraft(
      first === undefined || last === undefined
        ? null
        : draftOf(root, [first, ...rest], last.range.getBoundingClientRect()),
    );
  };

  const onPointerDown = (): void => {
    swallow.current = false;
  };

  const onMouseUp = (event: MouseEvent): void => {
    const root = container.current;
    const range = root === null || !commenting.value ? null : dragRange(event);

    if (root === null || range === null) return;
    swallow.current = true;
    const passage = passageFromRange(root, range);

    if (passage === null) return;
    document.getSelection()?.removeAllRanges();
    choose(root, { range, passage }, event);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const root = container.current;

    const target =
      root !== null && commenting.value && event.buttons === 0 && event.target instanceof Element
        ? targetAt(root, event.target, event.clientX, event.clientY)
        : null;

    if (target?.element === wash?.target.element) return;
    const rect = target === null ? undefined : boxOf(target);
    const at = root === null || rect === undefined ? null : inPane(root, rect);

    setWash(
      target === null || rect === undefined || at === null
        ? null
        : { target, ...at, width: rect.width, height: rect.height },
    );
  };

  const onClickCapture = (event: MouseEvent): void => {
    const root = container.current;

    if (root === null || !commenting.value) return;

    // A removed block's summary keeps its click: `preventDefault` would hold it folded.
    if (event.target instanceof Element && event.target.closest("details.removed") !== null) return;
    event.preventDefault();

    if (swallow.current) {
      swallow.current = false;

      return;
    }

    if (!(event.target instanceof Element)) return;
    const target = targetAt(root, event.target, event.clientX, event.clientY);
    const range = target === null ? null : targetRange(target);
    const passage = target === null || range === null ? null : passageOf(root, target, range);

    if (range === null || passage === null) return;
    choose(root, { range, passage }, event);
  };

  const waiting = waitingText(content !== null, failed);

  if (waiting !== null) return <div class="waiting">{waiting}</div>;
  const adding = holding.value && draft !== null;
  const pane = container.current === null ? null : paneWindow(container.current);

  const leave = (): void => {
    const root = container.current;
    const first = draft?.chosen[0];
    setDraft(null);

    if (root !== null && first !== undefined) focusPassage(root, first.passage);
  };

  return (
    <>
      <article
        class={adding ? "plan adding" : "plan"}
        ref={container}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onClickCapture={onClickCapture}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setWash(null)}
      >
        {content}
      </article>
      {wash !== null && (
        <div
          class="wash"
          style={{
            top: `${wash.top}px`,
            left: `${wash.left}px`,
            width: `${wash.width}px`,
            height: `${wash.height}px`,
          }}
        >
          <span class="wash-label">{wash.target.label}</span>
        </div>
      )}
      {draft !== null && pane !== null && (
        <Composer
          picks={draft.chosen.map(({ passage }) => ({
            key: `${passage.lines[0]}-${passage.prefix}-${passage.quote}`,
            text: passage.quote,
            where: `lines ${passage.lines[0]}–${passage.lines[1]}`,
          }))}
          through={adding}
          target={draft.target}
          pane={pane}
          onCancel={leave}
          onSubmit={(mark) => {
            const [first, ...rest] = draft.chosen;
            const passages = [first.passage, ...rest.map((one) => one.passage)] as const;
            props.annotate({ doc: props.doc.path, anchor: { kind: "text", passages }, mark });
            leave();
          }}
        />
      )}
    </>
  );
}

export const markdownPage: PageExtension = {
  id: "markdown",
  renderers: [{ accepts: (doc) => doc.mediaType === "text/markdown", component: MarkdownDoc }],
};
