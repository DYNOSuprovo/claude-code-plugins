import type { DocGroup, DocRef, GroupedDoc } from "../protocol.ts";
import { Badge } from "./kit.tsx";
import { annotations, currentDoc, docs, editing, select } from "./state.ts";

function imageKind(_mediaType: `image/${string}`): string {
  return "Image";
}

function kindOf(doc: DocRef): string {
  if (doc.mediaType === "text/markdown") return "Markdown";

  if (doc.mediaType === "text/html") return "HTML";

  return imageKind(doc.mediaType);
}

function nameOf(doc: DocRef): string {
  return doc.path.split("/").at(-1) ?? doc.path;
}

function count(path: string): number {
  return annotations.value.filter((a) => a.doc === path).length;
}

function inGroup(list: readonly GroupedDoc[], group: DocGroup): readonly GroupedDoc[] {
  return list.filter((doc) => doc.group === group);
}

export function DocList(): preact.JSX.Element {
  const plans = inGroup(docs.value, "plan");
  const artifacts = inGroup(docs.value, "artifact");
  const cited = inGroup(docs.value, "cited");

  const item = (doc: DocRef, name: string, kind: string): preact.JSX.Element => (
    <button
      type="button"
      key={doc.path}
      aria-selected={currentDoc.value?.path === doc.path}
      onClick={() => select(doc.path)}
    >
      <span class="name">{name}</span>
      <span class="kind">{kind}</span>
      {count(doc.path) > 0 && <Badge>{count(doc.path)}</Badge>}
    </button>
  );

  return (
    <nav class="rail" aria-label="Documents" inert={editing.value !== null}>
      {plans.length > 0 && <h5>Plan</h5>}
      {plans.map((doc) => item(doc, "Plan", nameOf(doc).replace(".md", "")))}
      <h5>Artifacts</h5>
      {artifacts.length === 0 && <div class="empty">No files yet</div>}
      {artifacts.map((doc) => item(doc, nameOf(doc), kindOf(doc)))}
      {cited.length > 0 && <h5>Cited in the plan</h5>}
      {cited.map((doc) => item(doc, nameOf(doc), kindOf(doc)))}
    </nav>
  );
}
