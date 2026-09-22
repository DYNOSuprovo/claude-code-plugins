import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { Mark, QuickLabel } from "../protocol.ts";
import { QUICK_LABELS } from "../protocol.ts";
import { Button, Chip, Popover } from "./kit.tsx";
import type { Rect } from "./place.ts";
import { placeNear } from "./place.ts";

/** One chosen place, as the popover shows it: what it says, and where it is. */
export type Pick = { readonly key: string; readonly text: string; readonly where: string };

export type ComposerProps = {
  readonly picks: readonly Pick[];
  /** While a target is being added, the popover fades and lets the pointer through. */
  readonly through: boolean;
  /** The last chosen place and the pane's window, both in the pane's scrolled content. */
  readonly target: Rect;
  readonly pane: Rect;
  readonly onSubmit: (mark: Mark) => void;
  readonly onCancel: () => void;
};

const LABELS: readonly QuickLabel[] = ["clarify", "verify", "tooMuch", "missingCheck"];

/** The popover's width before it is measured: what `style.css` gives `.popover`. */
const UNMEASURED = { width: 300, height: 0 };

/**
 * The popover near a selection: every chosen place, the labels and "Delete this", a textarea,
 * Cancel and Add comment. It does one thing: a label or "Delete this" is a comment by itself,
 * sent at the click, and typed text goes by Add comment, so the labels grey as soon as a text is typed.
 */
export function Composer(props: ComposerProps): preact.JSX.Element {
  const [body, setBody] = useState("");
  const [size, setSize] = useState(UNMEASURED);
  const box = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const places = props.picks.map((pick) => pick.key).join("|");
  const text = body.trim();

  // The popover is not remounted when its place changes, and a pick inside a mockup leaves the
  // focus in its frame: the textarea takes it back at every change of place.
  useEffect(() => textarea.current?.focus({ preventScroll: true }), [places]);

  // Placed from its own height, measured once drawn: another quote, another height.
  useLayoutEffect(() => {
    const element = box.current;

    if (element === null) return;
    const measured = { width: element.offsetWidth, height: element.offsetHeight };

    setSize((current) =>
      current.width === measured.width && current.height === measured.height ? current : measured,
    );
  });

  const at = placeNear(props.target, props.pane, size);

  const send = (): void => {
    if (text !== "") props.onSubmit({ kind: "comment", body: text });
  };

  return (
    <Popover
      label="New comment"
      through={props.through}
      top={at.top}
      left={at.left}
      box={box}
      onClose={props.onCancel}
      onSubmit={send}
    >
      {props.picks.map((pick) => (
        <div class="quote" key={pick.key}>
          “{pick.text}” · {pick.where}
        </div>
      ))}
      <div class="labels">
        {LABELS.map((label) => (
          <Chip
            key={label}
            disabled={text !== ""}
            onClick={() => props.onSubmit({ kind: "label", label })}
          >
            {QUICK_LABELS[label].name}
          </Chip>
        ))}
        <span class="spacer" />
        <Chip tone="del" disabled={text !== ""} onClick={() => props.onSubmit({ kind: "delete" })}>
          Delete this
        </Chip>
      </div>
      <textarea
        rows={3}
        aria-label="Comment"
        placeholder="Comment"
        autofocus
        ref={textarea}
        value={body}
        onInput={(event) => setBody(event.currentTarget.value)}
      />
      <div class="row">
        <Button size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="send" disabled={text === ""} onClick={send}>
          Add comment
        </Button>
      </div>
    </Popover>
  );
}
