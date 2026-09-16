import type { RootContent } from "hast";
import type { ComponentChild } from "preact";
import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { parseProjectPath } from "../../src/domain/paths.ts";
import type { Passage } from "../../src/protocol.ts";
import { passageFromRange, passageFromSelection, rangeFor } from "../../ui/anchoring.ts";
import { fileUrl } from "../../ui/api.ts";
import { Composer } from "../../ui/composer.tsx";
import { paint } from "../../ui/highlights.ts";
import { docs, inputMethod, select } from "../../ui/state.ts";
import type { RendererProps, UiPlugin } from "../index.ts";
import type { Target } from "./pinpoint.ts";
import { boxOf, rangeOf, targetAt, toggled } from "./pinpoint.ts";
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

/** hast to preact, by hand: the JSX runtime adapters type against a global JSX namespace this page does not own. */
function toVNode(node: RootContent, key: number): ComponentChild {
  if (node.type === "text") return node.value;

  if (node.type !== "element") return null;

  const attributes = Object.entries(node.properties).flatMap(([name, value]) => {
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

  return h(
    node.tagName,
    { key, ...extra, ...Object.fromEntries(attributes) },
    ...node.children.map(toVNode),
  );
}

type Chosen = { readonly element: HTMLElement; readonly passage: Passage };

type Draft = {
  readonly chosen: readonly [Chosen, ...Chosen[]];
  readonly top: number;
  readonly left: number;
};

type Wash = {
  readonly target: Target;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/** `rect`, from the viewport into the scrolled content of the pane around `root`. */
function inPane(root: HTMLElement, rect: DOMRect): { top: number; left: number } | null {
  const pane = root.parentElement;

  if (pane === null) return null;
  const paneRect = pane.getBoundingClientRect();

  return { top: rect.top - paneRect.top + pane.scrollTop, left: rect.left - paneRect.left };
}

function draftUnder(
  root: HTMLElement,
  chosen: readonly [Chosen, ...Chosen[]],
  rect: DOMRect,
): Draft | null {
  const at = inPane(root, rect);

  return at === null ? null : { chosen, top: at.top + rect.height + 8, left: Math.max(8, at.left) };
}

/** A link to a listed document switches the view; any other link opens in a new tab. */
function onClick(event: MouseEvent): void {
  if (inputMethod.value === "pinpoint") return;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const wanted = link?.dataset.path;

  if (wanted === undefined) return;
  const target = docs.value.find((doc) => doc.path === wanted || doc.path.endsWith(`/${wanted}`));

  if (target === undefined) return;
  event.preventDefault();
  select(target.path);
}

function MarkdownDoc(props: RendererProps): preact.JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [wash, setWash] = useState<Wash | null>(null);
  const container = useRef<HTMLElement>(null);

  const content = useMemo(
    () => (text === null ? null : toTree(text).children.map(toVNode)),
    [text],
  );

  useEffect(() => {
    void fetch(fileUrl(props.doc.path))
      .then((response) => response.text())
      .then(setText);
  }, [props.doc.path]);

  useEffect(() => {
    const root = container.current;

    if (root === null || text === null) return;

    const rangesOf = (passages: readonly Passage[]): Range[] =>
      passages.flatMap((passage) => {
        const range = rangeFor(root, passage);

        return range === null ? [] : [range];
      });

    paint(
      "vellum-comment",
      props.annotations.flatMap((annotation) =>
        annotation.anchor.kind === "text" ? rangesOf(annotation.anchor.passages) : [],
      ),
    );

    paint("vellum-draft", rangesOf((draft?.chosen ?? []).map((one) => one.passage)));

    return () => {
      paint("vellum-comment", []);
      paint("vellum-draft", []);
    };
  }, [props.annotations, draft, text]);

  const onMouseUp = (): void => {
    const root = container.current;

    if (root === null || inputMethod.value !== "select") return;
    const range = document.getSelection()?.getRangeAt(0);
    const passage = passageFromSelection(root);

    if (range === undefined || passage === null) return;
    const node = range.commonAncestorContainer;
    const element = node instanceof HTMLElement ? node : (node.parentElement ?? root);
    setDraft(draftUnder(root, [{ element, passage }], range.getBoundingClientRect()));
  };

  const onPointerMove = (event: PointerEvent): void => {
    const root = container.current;

    const target =
      root !== null && inputMethod.value === "pinpoint" && event.target instanceof Element
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

    if (root === null || inputMethod.value !== "pinpoint") return;
    event.preventDefault();

    if (!(event.target instanceof Element) || document.getSelection()?.isCollapsed === false) {
      return;
    }

    const target = targetAt(root, event.target, event.clientX, event.clientY);
    const range = target === null ? null : rangeOf(target.element);
    const passage = range === null ? null : passageFromRange(root, range);

    if (target === null || passage === null) return;
    const one = { element: target.element, passage };
    const adding = (event.ctrlKey || event.metaKey) && draft !== null;
    const [first, ...rest] = adding && draft !== null ? toggled(draft.chosen, one) : [one];

    setDraft(first === undefined ? null : draftUnder(root, [first, ...rest], boxOf(target)));
  };

  if (content === null) return <div class="waiting">Loading…</div>;

  return (
    <>
      <article
        class="plan"
        ref={container}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onClickCapture={onClickCapture}
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
      {draft !== null && (
        <Composer
          passages={draft.chosen.map((one) => one.passage)}
          top={draft.top}
          left={draft.left}
          onCancel={() => setDraft(null)}
          onSubmit={(body) => {
            const [first, ...rest] = draft.chosen;
            const passages = [first.passage, ...rest.map((one) => one.passage)] as const;
            props.annotate({ doc: props.doc.path, anchor: { kind: "text", passages }, body });
            setDraft(null);
            document.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </>
  );
}

export const markdownUi: UiPlugin = {
  id: "markdown",
  renderers: [{ accepts: (doc) => doc.mediaType === "text/markdown", component: MarkdownDoc }],
};
