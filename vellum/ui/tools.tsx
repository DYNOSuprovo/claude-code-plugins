import type { InputMethod } from "./state.ts";
import { currentDoc, inputMethod, planDoc, split } from "./state.ts";

const METHODS: readonly (readonly [InputMethod, string])[] = [
  ["select", "Select"],
  ["pinpoint", "Pinpoint"],
];

/** The controls over the document: Select|Pinpoint while a Markdown pane shows, Beside the plan while an artifact does. */
export function Tools(): preact.JSX.Element {
  const plan = planDoc.value;
  const doc = currentDoc.value;
  const beside = plan !== null && doc !== null && doc.path !== plan.path;
  const markdown = doc?.mediaType === "text/markdown" || (beside && split.value);

  return (
    <div class="tools">
      {markdown && (
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
      {markdown && beside && <span class="sep" />}
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
