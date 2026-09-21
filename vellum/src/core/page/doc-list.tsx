import type { DocGroup, DocRef, GroupedDoc } from "../protocol.ts";
import { Badge, Handle } from "./kit.tsx";
import { dirOf, planLabel } from "./rail.ts";
import { annotations, currentDoc, docs, editing, railOpen, review, select } from "./state.ts";

function nameOf(doc: DocRef): string {
  return doc.path.split("/").at(-1) ?? doc.path;
}

function count(path: string): number {
  return annotations.value.filter((a) => a.doc === path).length;
}

function inGroup(list: readonly GroupedDoc[], group: DocGroup): readonly GroupedDoc[] {
  return list.filter((doc) => doc.group === group);
}

/**
 * The fold control, on the rail's edge, which it follows. It carries no badge: folded, the rail
 * hides nothing, since `.doc-head` prints the document's path and `CommentsHandle` the total.
 */
export function RailHandle(): preact.JSX.Element {
  return (
    <Handle
      side="left"
      open={railOpen.value}
      controls="rail"
      name="Documents"
      onToggle={() => {
        railOpen.value = !railOpen.value;
      }}
    />
  );
}

export function DocList(): preact.JSX.Element {
  const workspace = review.value?.workspace;
  const plan = docs.value.find((doc) => doc.group === "plan");
  const artifacts = inGroup(docs.value, "artifact");
  const cited = inGroup(docs.value, "cited");

  const item = (doc: GroupedDoc): preact.JSX.Element => {
    const dir = doc.group === "cited" ? dirOf(doc.path) : "";

    return (
      <button
        type="button"
        key={doc.path}
        title={doc.path}
        aria-selected={currentDoc.value?.path === doc.path}
        onClick={() => select(doc.path)}
      >
        <span class="name">{nameOf(doc)}</span>
        {dir !== "" && <span class="dir">{dir}</span>}
        {count(doc.path) > 0 && <Badge>{count(doc.path)}</Badge>}
      </button>
    );
  };

  return (
    <nav
      id="rail"
      class={railOpen.value ? "rail" : "rail folded"}
      aria-label="Documents"
      inert={editing.value !== null || !railOpen.value}
    >
      {plan !== undefined && workspace !== undefined && (
        <button
          type="button"
          class="plate"
          aria-selected={currentDoc.value?.path === plan.path}
          onClick={() => select(plan.path)}
        >
          <span class="lead">Plan</span>
          <span class="ver">{planLabel(workspace)}</span>
          {count(plan.path) > 0 && <Badge>{count(plan.path)}</Badge>}
        </button>
      )}
      <h5>
        Artifacts <span class="n">{artifacts.length}</span>
      </h5>
      {artifacts.length === 0 && <div class="empty">No files yet</div>}
      {artifacts.map((doc) => item(doc))}
      {cited.length > 0 && (
        <div class="away">
          <h5>
            Cited in the plan <span class="n">{cited.length}</span>
          </h5>
          {cited.map((doc) => item(doc))}
        </div>
      )}
    </nav>
  );
}
