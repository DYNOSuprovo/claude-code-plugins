import { useEffect, useRef, useState } from "preact/hooks";

import { offsetOfLine } from "./caret.ts";
import { Button, Popover } from "./kit.tsx";
import type { EditSession } from "./state.ts";
import { editing, finishEdit, setTyped, typed } from "./state.ts";

/** The session the editor opened on: nothing in it changes while it is open. */
export type EditorProps = {
  readonly session: EditSession;
};

/** Cancel: the editor closes and its typing goes, the draft's copy with it. */
function discard(): void {
  setTyped({ editor: null });
  editing.value = null;
}

/**
 * The plan's Markdown source in place of its rendering: a plain textarea, Cancel and Done.
 * Nothing is sent from here: Done hands the text to the store, and the next decision carries it.
 * The typing goes to the draft as it pauses, and comes back to the next editor on the same
 * version; Cancel over a changed text asks first.
 */
export function Editor({ session }: EditorProps): preact.JSX.Element {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [asking, setAsking] = useState(false);
  const kept = typed.peek().editor;
  const initial = kept !== null && kept.version === session.version ? kept.text : session.base;

  useEffect(() => {
    const area = textarea.current;

    if (area === null) return;
    const offset = offsetOfLine(session.base, session.line);
    area.setSelectionRange(offset, offset);
    // A focus taken after the caret moved is what scrolls a textarea to its caret.
    area.blur();
    area.focus();
  }, []);

  const text = (): string => textarea.current?.value ?? session.base;

  const cancel = (): void => {
    if (text() === session.base) discard();
    else setAsking(true);
  };

  return (
    <>
      <div class="tools">
        <span>Editing the source of v{session.version}</span>
        <span class="spacer" />
        <Button size="sm" onClick={cancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="send"
          onClick={() => {
            setTyped({ editor: null });
            finishEdit(session, text());
          }}
        >
          Done
        </Button>
        {asking && (
          <Popover
            label="Before leaving the editor"
            class="pop-bar"
            onClose={() => setAsking(false)}
          >
            <div class="warn-text">What you typed is not kept.</div>
            <div>Cancel throws it away.</div>
            <div class="row">
              <Button size="sm" onClick={() => setAsking(false)}>
                Keep editing
              </Button>
              <Button size="sm" variant="send" onClick={discard}>
                Discard
              </Button>
            </div>
          </Popover>
        )}
      </div>
      <div class="panes">
        <div class="editor">
          <textarea
            ref={textarea}
            spellcheck={false}
            aria-label="Plan source"
            defaultValue={initial}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setTyped({
                editor: value === session.base ? null : { version: session.version, text: value },
              });
            }}
          />
        </div>
      </div>
    </>
  );
}
