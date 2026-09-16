import type { ProjectPath, Version } from "./paths.ts";

/** One place in a document: a quote with its context and source lines. */
export type Passage = {
  readonly quote: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly lines: readonly [number, number];
};

/** Where a comment points: the document as a whole, or one or more passages of it. */
export type Anchor =
  | { readonly kind: "global" }
  | { readonly kind: "text"; readonly passages: readonly [Passage, ...Passage[]] };

export type Annotation = {
  readonly id: string;
  readonly doc: ProjectPath;
  readonly anchor: Anchor;
  readonly body: string;
};

function indent(body: string): string {
  return body.trim().split("\n").join("\n   ");
}

function place(passage: Passage): string {
  return `lines ${passage.lines[0]}–${passage.lines[1]}: "${passage.quote}"`;
}

/** The text Claude reads: one numbered item per comment, the place first, the comment under it. */
export function formatFeedback(annotations: readonly Annotation[], version: Version): string {
  const items = annotations.map((annotation, index) => {
    const { anchor } = annotation;
    const doc = `\`${annotation.doc}\``;

    const where =
      anchor.kind === "global"
        ? `${doc}, general`
        : anchor.passages.length === 1
          ? `${doc} ${place(anchor.passages[0])}`
          : `${doc}\n${anchor.passages.map((passage) => `   - ${place(passage)}`).join("\n")}`;

    return `${index + 1}. ${where}\n   ${indent(annotation.body)}`;
  });

  return `# Plan review: changes requested (v${version})\n\n${items.join("\n\n")}\n`;
}
