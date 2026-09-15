import type { Root, RootContent } from "hast";
import type { ComponentChild } from "preact";
import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { parseProjectPath } from "../../src/workspace/paths.ts";
import type { TextAnchor } from "../../ui/anchoring.ts";
import { anchorFromSelection, rangeFor } from "../../ui/anchoring.ts";
import { Composer } from "../../ui/composer.tsx";
import { paint } from "../../ui/highlights.ts";
import { docs, fileUrl, select } from "../../ui/state.ts";
import type { RendererProps, UiPlugin } from "../index.ts";

/** Every block element keeps its source lines as `data-lines="start-end"`. */
function addLines(node: Root | RootContent): void {
  if (node.type === "element" && node.position !== undefined) {
    node.properties.dataLines = `${node.position.start.line}-${node.position.end.line}`;
  }

  if ("children" in node) for (const child of node.children) addLines(child);
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

function toTree(text: string): Root {
  const tree = processor.runSync(processor.parse(text));
  addLines(tree);

  return tree;
}

function attributeName(property: string): string {
  if (property === "className") return "class";

  return property.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

/** hast to preact, by hand: the JSX runtime adapters type against a global JSX namespace this page does not own. */
function toVNode(node: RootContent, key: number): ComponentChild {
  if (node.type === "text") return node.value;

  if (node.type !== "element") return null;

  const attributes = Object.entries(node.properties).flatMap(([name, value]) => {
    if (value === undefined || value === null || value === false) return [];

    return [
      [attributeName(name), Array.isArray(value) ? value.join(" ") : value === true ? "" : value],
    ];
  });

  return h(node.tagName, { key, ...Object.fromEntries(attributes) }, ...node.children.map(toVNode));
}

type Draft = { readonly anchor: TextAnchor; readonly top: number; readonly left: number };

/** A link to a listed document switches the view instead of leaving the page. */
function onClick(event: MouseEvent): void {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href");

  if (href === null || href === undefined || /^[a-z][a-z0-9+.-]*:/iu.test(href)) return;
  const direct = parseProjectPath(href.split(/[#?]/u)[0] ?? "");
  const wanted = direct.ok ? direct.value : href;
  const target = docs.value.find((doc) => doc.path === wanted || doc.path.endsWith(`/${wanted}`));

  if (target === undefined) return;
  event.preventDefault();
  select(target.path);
}

function MarkdownDoc(props: RendererProps): preact.JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const container = useRef<HTMLElement>(null);

  useEffect(() => {
    void fetch(fileUrl(props.doc.path))
      .then((response) => response.text())
      .then(setText);
  }, [props.doc.path]);

  useEffect(() => {
    const root = container.current;

    if (root === null || text === null) return;

    const ranges = props.annotations.flatMap((annotation) => {
      const range = annotation.anchor.kind === "text" ? rangeFor(root, annotation.anchor) : null;

      return range === null ? [] : [range];
    });

    paint("vellum-comment", ranges);
    const draftRange = draft === null ? null : rangeFor(root, draft.anchor);
    paint("vellum-draft", draftRange === null ? [] : [draftRange]);

    return () => {
      paint("vellum-comment", []);
      paint("vellum-draft", []);
    };
  }, [props.annotations, draft, text]);

  const onMouseUp = (): void => {
    const root = container.current;

    if (root === null) return;
    const anchor = anchorFromSelection(root);

    if (anchor === null) return;
    const selection = document.getSelection();
    const rect = selection?.getRangeAt(0).getBoundingClientRect();
    const pane = root.parentElement;
    const paneRect = pane?.getBoundingClientRect();

    if (rect === undefined || pane === null || paneRect === undefined) return;

    setDraft({
      anchor,
      top: rect.bottom - paneRect.top + pane.scrollTop + 8,
      left: Math.max(8, rect.left - paneRect.left),
    });
  };

  if (text === null) return <div class="waiting">Loading…</div>;

  return (
    <>
      <article class="plan" ref={container} onMouseUp={onMouseUp} onClick={onClick}>
        {toTree(text).children.map(toVNode)}
      </article>
      {draft !== null && (
        <Composer
          anchor={draft.anchor}
          top={draft.top}
          left={draft.left}
          onCancel={() => setDraft(null)}
          onSubmit={(body) => {
            props.annotate({ doc: props.doc.path, anchor: draft.anchor, body });
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
