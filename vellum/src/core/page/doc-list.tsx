import type { DocGroup, DocRef, GroupedDoc, PlanWorkspace } from "../protocol.ts";
import { Badge } from "./kit.tsx";
import { annotations, currentDoc, docs, editing, review, select } from "./state.ts";

function nameOf(doc: DocRef): string {
  return doc.path.split("/").at(-1) ?? doc.path;
}

/** The folder's last segment; "" at the project root, where the column is not drawn. */
function dirOf(path: string): string {
  return path.split("/").at(-2) ?? "";
}

/** What the plate prints beside `Plan`: `draft` before the first version, `v<n>` after. */
function planLabel(workspace: PlanWorkspace): string {
  return workspace.kind === "drafting" ? "draft" : `v${workspace.version}`;
}

function count(path: string): number {
  return annotations.value.filter((a) => a.doc === path).length;
}

function inGroup(list: readonly GroupedDoc[], group: DocGroup): readonly GroupedDoc[] {
  return list.filter((doc) => doc.group === group);
}

export function DocList(): preact.JSX.Element {
  const workspace = review.value?.workspace;
  const plans = inGroup(docs.value, "plan");
  const artifacts = inGroup(docs.value, "artifact");
  const cited = inGroup(docs.value, "cited");

  const item = (doc: DocRef, name: string, dir: string): preact.JSX.Element => (
    <button
      type="button"
      key={doc.path}
      title={doc.path}
      aria-selected={currentDoc.value?.path === doc.path}
      onClick={() => select(doc.path)}
    >
      <span class="name">{name}</span>
      {dir !== "" && <span class="dir">{dir}</span>}
      {count(doc.path) > 0 && <Badge>{count(doc.path)}</Badge>}
    </button>
  );

  return (
    <nav class="rail" aria-label="Documents" inert={editing.value !== null}>
      {workspace !== undefined &&
        plans.map((doc) => (
          <button
            type="button"
            class="plate"
            key={doc.path}
            aria-selected={currentDoc.value?.path === doc.path}
            onClick={() => select(doc.path)}
          >
            <span class="lead">Plan</span>
            <span class="ver">{planLabel(workspace)}</span>
          </button>
        ))}
      <h5>
        Artifacts <span class="n">{artifacts.length}</span>
      </h5>
      {artifacts.length === 0 && <div class="empty">No files yet</div>}
      {artifacts.map((doc) => item(doc, nameOf(doc), ""))}
      {cited.length > 0 && (
        <div class="away">
          <h5>
            Cited in the plan <span class="n">{cited.length}</span>
          </h5>
          {cited.map((doc) => item(doc, nameOf(doc), dirOf(doc.path)))}
        </div>
      )}
    </nav>
  );
}
