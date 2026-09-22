import { useState } from "preact/hooks";

import type { Anchor, Annotation, Mark } from "../protocol.ts";
import { DELETE_SENTENCE, QUICK_LABELS } from "../protocol.ts";
import { Badge, Button, Handle, Tag } from "./kit.tsx";
import {
  addAnnotation,
  annotations,
  commentsOpen,
  currentDoc,
  editing,
  locked,
  removeAnnotation,
  review,
  setTyped,
  typed,
  updateAnnotation,
} from "./state.ts";
import { switchShown } from "./tools.tsx";

/** What the card says above the quotes: general, the lines of the passages, or the elements. */
function whereOf(anchor: Anchor): string {
  if (anchor.kind === "global") return "general";

  if (anchor.kind === "text") {
    return `lines ${anchor.passages.map((passage) => `${passage.lines[0]}–${passage.lines[1]}`).join(", ")}`;
  }

  return anchor.elements.map((element) => element.selector).join(", ");
}

type Quote = { readonly key: string; readonly text: string; readonly removed: boolean };

function quotesOf(anchor: Anchor): readonly Quote[] {
  if (anchor.kind === "global") return [];

  if (anchor.kind === "text") {
    return anchor.passages.map((passage) => ({
      key: `${passage.lines[0]}-${passage.quote}`,
      text: passage.quote,
      removed: passage.removed,
    }));
  }

  return anchor.elements.map((element) => ({
    key: element.selector,
    text: element.text,
    removed: false,
  }));
}

/** The empty panel names the switch only where `Tools` draws it, and the box only where it takes text. */
function emptyLine(boxOpen: boolean): string {
  if (!boxOpen) return "No comments yet.";

  // `true`: `app.tsx` draws the panel only where what is on screen takes comments.
  return switchShown(true)
    ? "No comments yet. Turn on Comment to pick text, or use the box below."
    : "No comments yet. Use the box below.";
}

function MarkWords(props: { readonly mark: Mark }): preact.JSX.Element {
  const { mark } = props;

  if (mark.kind === "comment") return <div>{mark.body}</div>;

  if (mark.kind === "delete") return <div>{DELETE_SENTENCE}</div>;

  return (
    <div>
      <Tag>{QUICK_LABELS[mark.label].name}</Tag>
    </div>
  );
}

/**
 * A comment's words, reopened in place: every keystroke with words in it goes to the annotation
 * itself, so the store never holds an empty comment and a reload keeps the last words; the card
 * keeps the field's text, so that it can be cleared, and `open`. While the editor is open the
 * actions are off, the card readable.
 */
function CardWords(props: { readonly annotation: Annotation }): preact.JSX.Element {
  const { annotation } = props;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { mark } = annotation;
  const off = editing.value !== null;

  const reopen = (body: string): void => {
    setText(body);
    setOpen(true);
  };

  const type = (body: string): void => {
    setText(body);

    if (body.trim() !== "") updateAnnotation(annotation.id, { kind: "comment", body });
  };

  if (!open || mark.kind !== "comment") {
    return (
      <>
        <MarkWords mark={mark} />
        {!locked.value && (
          <div class="actions">
            {mark.kind === "comment" && (
              <button type="button" disabled={off} onClick={() => reopen(mark.body)}>
                Edit
              </button>
            )}
            <button type="button" disabled={off} onClick={() => removeAnnotation(annotation.id)}>
              Delete
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <textarea
        rows={3}
        aria-label="Comment"
        autofocus
        value={text}
        onInput={(event) => type(event.currentTarget.value)}
      />
      <div class="actions">
        <button type="button" disabled={text.trim() === ""} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </>
  );
}

function Card(props: { readonly annotation: Annotation }): preact.JSX.Element {
  const { annotation } = props;
  const dir = review.value?.workspace.dir ?? "";
  const doc = annotation.doc.startsWith(dir) ? annotation.doc.slice(dir.length) : annotation.doc;

  return (
    <div class="card">
      <div class="where" title={annotation.doc}>
        {doc} · {whereOf(annotation.anchor)}
      </div>
      {quotesOf(annotation.anchor).map((quote) => (
        <div class={annotation.mark.kind === "delete" ? "quote struck" : "quote"} key={quote.key}>
          “{quote.text}”{quote.removed && <Tag>removed by your edit</Tag>}
        </div>
      ))}
      <CardWords annotation={annotation} />
    </div>
  );
}

/**
 * The fold control, on the panel's edge, which it follows. Folded, it is the only trace left of
 * the panel, so it carries the total: neither `Comments` nor the decision bar filters by document.
 */
export function CommentsHandle(): preact.JSX.Element {
  const count = annotations.value.length;

  return (
    <Handle
      side="right"
      open={commentsOpen.value}
      controls="comments"
      name="Comments"
      label={`Comments (${count})`}
      onToggle={() => {
        commentsOpen.value = !commentsOpen.value;
      }}
    >
      {count > 0 && <Badge>{count}</Badge>}
    </Handle>
  );
}

export function Comments(): preact.JSX.Element {
  const draft = typed.value.general;
  const doc = currentDoc.value;
  const list = annotations.value;
  const name = doc === null ? "" : (doc.path.split("/").at(-1) ?? doc.path);

  const add = (): void => {
    if (doc === null || draft.trim() === "") return;
    addAnnotation({
      doc: doc.path,
      anchor: { kind: "global" },
      mark: { kind: "comment", body: draft.trim() },
    });
    setTyped({ general: "" });
  };

  return (
    <aside
      id="comments"
      class={commentsOpen.value ? "comments" : "comments folded"}
      aria-label="Comments"
      inert={!commentsOpen.value}
    >
      <header>
        Comments <span>{list.length}</span>
      </header>
      <div class="list">
        {list.length === 0 && <div class="none">{emptyLine(!locked.value && doc !== null)}</div>}
        {list.map((annotation) => (
          <Card key={annotation.id} annotation={annotation} />
        ))}
      </div>
      <div class="global">
        <label for="global">Comment on {name}</label>
        <textarea
          id="global"
          rows={2}
          placeholder="General feedback on this document"
          disabled={locked.value || doc === null || editing.value !== null}
          value={draft}
          onInput={(event) => setTyped({ general: event.currentTarget.value })}
        />
        <div class="row">
          <Button
            size="sm"
            disabled={locked.value || doc === null || editing.value !== null || draft.trim() === ""}
            onClick={add}
          >
            Add comment
          </Button>
        </div>
      </div>
    </aside>
  );
}
