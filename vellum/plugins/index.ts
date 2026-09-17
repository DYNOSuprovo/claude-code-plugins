import type { ComponentType } from "preact";

import type { Annotation, DocRef, LineDiff } from "../src/protocol.ts";
import { htmlUi } from "./html/ui.tsx";
import { imageUi } from "./image/ui.tsx";
import { markdownUi } from "./markdown/ui.tsx";

export type RendererProps = {
  readonly doc: DocRef;
  readonly annotations: readonly Annotation[];
  readonly annotate: (annotation: Omit<Annotation, "id">) => void;
  /** The changes to mark while "Changes since" is on; `null` when it is off or the document is not the plan. */
  readonly changes: LineDiff | null;
};

export type Renderer = {
  readonly accepts: (doc: DocRef) => boolean;
  readonly component: ComponentType<RendererProps>;
};

export type UiPlugin = {
  readonly id: string;
  readonly renderers?: readonly Renderer[];
};

/** Every rendering plugin, in match order; the page bundles them all. */
export const uiPlugins: readonly UiPlugin[] = [markdownUi, htmlUi, imageUi];
