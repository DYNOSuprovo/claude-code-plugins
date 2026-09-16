import { useState } from "preact/hooks";

/** One chosen place, as the popover shows it: what it says, and where it is. */
export type Pick = { readonly key: string; readonly text: string; readonly where: string };

export type ComposerProps = {
  readonly picks: readonly Pick[];
  /** While a target is being added, the popover fades and lets the pointer through. */
  readonly through: boolean;
  readonly top: number;
  readonly left: number;
  readonly onSubmit: (body: string) => void;
  readonly onCancel: () => void;
};

/** The popover under a selection: every chosen place, a textarea, Cancel and Add comment. */
export function Composer(props: ComposerProps): preact.JSX.Element {
  const [body, setBody] = useState("");

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
