import { useEffect, useRef, useState } from "preact/hooks";

import type { ElementRef } from "../../src/protocol.ts";
import { fileUrl } from "../../ui/api.ts";
import { Composer } from "../../ui/composer.tsx";
import { holding, inputMethod } from "../../ui/state.ts";
import type { RendererProps, UiPlugin } from "../index.ts";
import type { FrameToPage, PageToFrame, PickBox } from "./messages.ts";

type Draft = {
  readonly elements: readonly [ElementRef, ...ElementRef[]];
  readonly box: PickBox;
};

/** The frame's box plus the iframe's own place in the scrolled pane. */
function under(frame: HTMLIFrameElement, box: PickBox): { top: number; left: number } | null {
  const pane = frame.parentElement;

  if (pane === null) return null;
  const rect = frame.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  const top = box.top + rect.top - paneRect.top + pane.scrollTop;

  return { top: top + box.height + 8, left: Math.max(8, box.left + rect.left - paneRect.left) };
}

function HtmlDoc(props: RendererProps): preact.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [frameHolding, setFrameHolding] = useState(false);
  const method = inputMethod.value;
  const held = holding.value;

  const selectors = props.annotations.flatMap((annotation) =>
    annotation.anchor.kind === "element"
      ? annotation.anchor.elements.map((element) => element.selector)
      : [],
  );

  const post = (message: PageToFrame): void =>
    frame.current?.contentWindow?.postMessage(message, "*");

  useEffect(() => {
    post({ type: "vellum:method", method });

    if (method === "select") setDraft(null);
  }, [method]);

  useEffect(() => post({ type: "vellum:holding", holding: held }), [held]);

  useEffect(
    () => post({ type: "vellum:comments", selectors }),
    [selectors.join("|"), props.doc.path],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.current?.contentWindow) return;
      // SAFETY: the frame's own `FrameToPage`, from the window this renderer mounted.
      const message = event.data as FrameToPage;

      if (message.type === "vellum:unpick") setDraft(null);

      if (message.type === "vellum:holding") setFrameHolding(message.holding);

      if (message.type === "vellum:pick") {
        const [first, ...rest] = message.elements;

        setDraft(first === undefined ? null : { elements: [first, ...rest], box: message.box });
      }
    };

    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);
  }, []);

  const close = (): void => {
    setDraft(null);
    post({ type: "vellum:clear" });
  };

  const at = frame.current === null || draft === null ? null : under(frame.current, draft.box);
  const adding = (held || frameHolding) && draft !== null;

  return (
    <>
      <iframe
        title={props.doc.path}
        ref={frame}
        sandbox="allow-scripts"
        src={fileUrl(props.doc.path)}
        onLoad={() => {
          post({ type: "vellum:method", method });
          post({ type: "vellum:comments", selectors });
        }}
      />
      {draft !== null && at !== null && (
        <Composer
          picks={draft.elements.map((element) => ({
            key: element.selector,
            text: element.text,
            where: element.label,
          }))}
          through={adding}
          top={at.top}
          left={at.left}
          onCancel={close}
          onSubmit={(body) => {
            props.annotate({
              doc: props.doc.path,
              anchor: { kind: "element", elements: draft.elements },
              body,
            });
            close();
          }}
        />
      )}
    </>
  );
}

export const htmlUi: UiPlugin = {
  id: "html",
  renderers: [{ accepts: (doc) => doc.mediaType === "text/html", component: HtmlDoc }],
};
