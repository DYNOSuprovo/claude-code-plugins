import type { ComponentType } from "preact";

import type { Annotation, DocRef, LineDiff } from "../core/protocol.ts";
import { htmlPage } from "./html/page.tsx";
import { imagePage } from "./image/page.tsx";
import { markdownPage } from "./markdown/page.tsx";

export type RendererProps = {
  readonly doc: DocRef;
  readonly annotations: readonly Annotation[];
  readonly annotate: (annotation: Omit<Annotation, "id">) => void;
  /** The reviewer's unsent edit of this document, rendered in place of the file. */
  readonly source: string | null;
  /** The changes to mark while "Changes since" is on; `null` when it is off or the document is not the plan. */
  readonly changes: LineDiff | null;
};

export type Renderer = {
  readonly accepts: (doc: DocRef) => boolean;
  readonly component: ComponentType<RendererProps>;
};

export type PageExtension = {
  readonly id: string;
  readonly renderers?: readonly Renderer[];
};

/** Every rendering plugin, in match order; the page bundles them all. */
export const pageExtensions: readonly PageExtension[] = [markdownPage, htmlPage, imagePage];
