import type { ComponentType } from "preact";

import type { Annotation, DocLink, DocRef, LineDiff, LinkRoots } from "./protocol.ts";

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

/** A server extension proposes documents linked from the plan; the server keeps those that exist. */
export type ServerExtension = {
  readonly id: string;
  readonly linkedDocs?: (plan: string, roots: LinkRoots) => readonly DocLink[];
};
