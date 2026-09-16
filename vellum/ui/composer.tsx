import { useState } from "preact/hooks";

import type { Passage } from "../src/protocol.ts";

export type ComposerProps = {
  readonly passages: readonly Passage[];
  /** While a target is being added, the popover fades and lets the pointer through. */
  readonly through: boolean;
  readonly top: number;
  readonly left: number;
  readonly onSubmit: (body: string) => void;
  readonly onCancel: () => void;
};

/** The popover under a selection: every chosen quote, a textarea, Cancel and Add comment. */
export function Composer(props: ComposerProps): preact.JSX.Element {
  const [body, setBody] = useState("");

  return (
    <div
      class={props.through ? "popover through" : "popover"}
      role="dialog"
      aria-label="New comment"
      style={{ top: `${props.top}px`, left: `${props.left}px` }}
    >
      {props.passages.map((passage) => (
        <div class="quote" key={`${passage.lines[0]}-${passage.quote}`}>
          “{passage.quote}” · lines {passage.lines[0]}–{passage.lines[1]}
        </div>
      ))}
      <textarea
        rows={3}
        aria-label="Comment"
        autoFocus
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
          onClick={() => props.onSubmit(body.trim())}
        >
          Add comment
        </button>
      </div>
    </div>
  );
}
