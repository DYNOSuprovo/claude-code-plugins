import { render } from "preact";
import { useEffect } from "preact/hooks";

import { uiPlugins } from "../plugins/index.ts";
import type { DocRef } from "../src/protocol.ts";
import { Comments } from "./comments.tsx";
import { DecisionBar } from "./decision-bar.tsx";
import { DocList } from "./doc-list.tsx";
import {
  addAnnotation,
  annotations,
  currentDoc,
  holding,
  listen,
  loadReview,
  planDoc,
  split,
  step,
} from "./state.ts";
import { Tools } from "./tools.tsx";

function Doc(props: { readonly doc: DocRef }): preact.JSX.Element {
  const { doc } = props;

  const renderer = uiPlugins
    .flatMap((plugin) => plugin.renderers ?? [])
    .find((candidate) => candidate.accepts(doc));

  if (renderer === undefined) return <div class="waiting">No renderer for {doc.mediaType}</div>;
  const Component = renderer.component;

  return (
    <div class="pane" key={doc.path}>
      <Component
        doc={doc}
        annotations={annotations.value.filter((a) => a.doc === doc.path)}
        annotate={addAnnotation}
      />
    </div>
  );
}

function Panes(): preact.JSX.Element {
  const plan = planDoc.value;
  const doc = currentDoc.value;

  if (doc === null) {
    return (
      <div class="docs">
        <div class="waiting">Nothing to show yet. The working directory's files appear here.</div>
      </div>
    );
  }

  const beside = plan !== null && doc.path !== plan.path;

  return (
    <div class="docs">
      <div class="doc-head">
        <span class="path">{doc.path}</span>
      </div>
      <Tools />
      <div class="panes">
        {beside && split.value && plan !== null && <Doc doc={plan} />}
        <Doc doc={doc} />
      </div>
    </div>
  );
}

function App(): preact.JSX.Element {
  useEffect(() => {
    void loadReview();
    listen();

    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }

      if (event.key === "]") step(1);

      if (event.key === "[") step(-1);
    };

    const held = (event: KeyboardEvent): void => {
      holding.value = event.ctrlKey || event.metaKey;
    };

    const release = (): void => {
      holding.value = false;
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", held);
    document.addEventListener("keyup", held);
    window.addEventListener("blur", release);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", held);
      document.removeEventListener("keyup", held);
      window.removeEventListener("blur", release);
    };
  }, []);

  return (
    <div class="app">
      <DecisionBar />
      <div class="body">
        <DocList />
        <Panes />
        <Comments />
      </div>
    </div>
  );
}

const root = document.querySelector("#root");

if (root !== null) render(<App />, root);
