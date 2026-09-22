import { Button, Switch } from "./kit.tsx";
import {
  commentSwitch,
  currentDoc,
  editing,
  flipCommentSwitch,
  locked,
  planDoc,
  review,
  showChanges,
  split,
} from "./state.ts";

/** Where the switch is drawn, and false while the editor is open; `app.tsx` reads it before `C` flips the switch. */
export function switchShown(comments: boolean): boolean {
  const plan = planDoc.value;
  const doc = currentDoc.value;
  const beside = plan !== null && doc !== null && doc.path !== plan.path;

  return (
    comments &&
    editing.value === null &&
    !locked.value &&
    (doc?.mediaType === "text/markdown" ||
      doc?.mediaType === "text/html" ||
      (beside && split.value))
  );
}

/**
 * The controls over the document: the Comment switch while a pane takes comments, Beside the plan
 * while an artifact shows, Edit while the plan under review shows, Changes since while the plan
 * is drawn and has a version before it.
 */
type ToolsProps = {
  readonly onEdit: () => void;
  /** Whether what is on screen takes comments, as `app.tsx` reads it off the renderer. */
  readonly comments: boolean;
};

export function Tools(props: ToolsProps): preact.JSX.Element {
  const plan = planDoc.value;
  const doc = currentDoc.value;
  const beside = plan !== null && doc !== null && doc.path !== plan.path;
  const editable = plan !== null && !beside && review.value?.workspace.kind === "inReview";
  const planDrawn = plan !== null && (!beside || split.value);
  const since = planDrawn ? (review.value?.plan?.previous?.version ?? null) : null;
  const shown = switchShown(props.comments);

  return (
    <div class="tools">
      {shown && (
        <>
          <Switch checked={commentSwitch.value} onChange={flipCommentSwitch}>
            Comment
          </Switch>
          <kbd>C</kbd>
        </>
      )}
      {shown && beside && <span class="sep" />}
      {beside && (
        <Switch
          checked={split.value}
          onChange={() => {
            split.value = !split.value;
          }}
        >
          Beside the plan
        </Switch>
      )}
      {editable && (
        <>
          <span class="sep" />
          <Button size="sm" onClick={props.onEdit}>
            Edit
          </Button>
        </>
      )}
      {since !== null && (
        <>
          <span class="sep" />
          <Switch
            checked={showChanges.value}
            onChange={() => {
              showChanges.value = !showChanges.value;
            }}
          >
            Changes since v{since}
          </Switch>
        </>
      )}
    </div>
  );
}
