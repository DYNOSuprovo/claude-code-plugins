import { useEffect, useRef, useState } from "preact/hooks";

import type { Mark, QuickLabel } from "../src/protocol.ts";
import { QUICK_LABELS } from "../src/protocol.ts";

/** One chosen place, as the popover shows it: what it says, and where it is. */
export type Pick = { readonly key: string; readonly text: string; readonly where: string };

export type ComposerProps = {
  readonly picks: readonly Pick[];
  /** While a target is being added, the popover fades and lets the pointer through. */
  readonly through: boolean;
  readonly top: number;
  readonly left: number;
  readonly onSubmit: (mark: Mark) => void;
  readonly onCancel: () => void;
};

const LABELS: readonly QuickLabel[] = ["clarify", "verify", "tooMuch", "missingCheck"];

/**
 * The popover under a selection: every chosen place, the labels and "Delete this", a textarea,
 * Cancel and Add comment. A label or "Delete this" submits at once; a label takes the
 * textarea's text as its detail, which may be empty.
 */
export function Composer(props: ComposerProps): preact.JSX.Element {
  const [body, setBody] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const places = props.picks.map((pick) => pick.key).join("|");

  // The popover is not remounted when its place changes, and a pick inside a mockup leaves the
  // focus in its frame: the textarea takes it back at every change of place.
  useEffect(() => textarea.current?.focus(), [places]);

  return (
    <div
      class={props.through ? "popover through" : "popover"}
      role="dialog"
      aria-label="New comment"
      style={{ top: `${props.top}px`, left: `${props.left}px` }}
    >
      {props.picks.map((pick) => (
        <div class="quote" key={pick.key}>
          “{pick.text}” · {pick.where}
        </div>
      ))}
      <div class="labels">
        {LABELS.map((label) => (
          <button
            class="chip"
            type="button"
            key={label}
            onClick={() => props.onSubmit({ kind: "label", label, body: body.trim() })}
          >
            {QUICK_LABELS[label].name}
          </button>
        ))}
        <span class="spacer" />
        <button class="chip del" type="button" onClick={() => props.onSubmit({ kind: "delete" })}>
          Delete this
        </button>
      </div>
      <textarea
        rows={3}
        aria-label="Comment"
        placeholder="Comment, or a detail for the label"
        ref={textarea}
        value={body}
        onInput={(event) => setBody(event.currentTarget.value)}
      />
      <div class="row">
        <button class="btn small" type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          class="btn small send"
          type="button"
          disabled={body.trim() === ""}
          onClick={() => props.onSubmit({ kind: "comment", body: body.trim() })}
        >
          Add comment
        </button>
      </div>
    </div>
  );
}
