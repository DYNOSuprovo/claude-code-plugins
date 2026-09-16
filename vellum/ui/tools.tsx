import type { InputMethod } from "./state.ts";
import { currentDoc, inputMethod, planDoc, split } from "./state.ts";

const METHODS: readonly (readonly [InputMethod, string])[] = [
  ["select", "Select"],
  ["pinpoint", "Pinpoint"],
];

/** The controls over the document: Select|Pinpoint while a pane takes comments, Beside the plan while an artifact shows. */
export function Tools(): preact.JSX.Element {
  const plan = planDoc.value;
  const doc = currentDoc.value;
  const beside = plan !== null && doc !== null && doc.path !== plan.path;

  const pinpointable =
    doc?.mediaType === "text/markdown" || doc?.mediaType === "text/html" || (beside && split.value);

  return (
    <div class="tools">
      {pinpointable && (
        <span class="seg" role="group" aria-label="Input method">
          {METHODS.map(([method, name]) => (
            <button
              key={method}
              type="button"
              aria-pressed={inputMethod.value === method}
              onClick={() => {
                inputMethod.value = method;
              }}
            >
              {name}
            </button>
          ))}
        </span>
      )}
      {pinpointable && beside && <span class="sep" />}
      {beside && (
        <label class="toggle">
          <input
            type="checkbox"
            checked={split.value}
            onChange={(event) => {
              split.value = event.currentTarget.checked;
            }}
          />{" "}
          Beside the plan
        </label>
      )}
    </div>
  );
}
