import type { ProjectPath, Version } from "./paths.ts";

/** One place in a document: a quote with its context and source lines. */
export type Passage = {
  readonly quote: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly lines: readonly [number, number];
};

/** One element of a rendered document: where it sits, what it shows, what to call it. */
export type ElementRef = {
  readonly selector: string;
  readonly text: string;
  readonly label: string;
};

/** Where a comment points: the document as a whole, passages of it, or elements of it. */
export type Anchor =
  | { readonly kind: "global" }
  | { readonly kind: "text"; readonly passages: readonly [Passage, ...Passage[]] }
  | { readonly kind: "element"; readonly elements: readonly [ElementRef, ...ElementRef[]] };

export type Annotation = {
  readonly id: string;
  readonly doc: ProjectPath;
  readonly anchor: Anchor;
  readonly body: string;
};

function indent(body: string): string {
  return body.trim().split("\n").join("\n   ");
}

/** Where each anchored place is, one string each; a global anchor has none. */
function placesOf(anchor: Anchor): readonly string[] {
  if (anchor.kind === "global") return [];

  if (anchor.kind === "text") {
    return anchor.passages.map(
      (passage) => `lines ${passage.lines[0]}–${passage.lines[1]}: "${passage.quote}"`,
    );
  }

  return anchor.elements.map(
    (element) => `element \`${element.selector}\` (${element.label}): "${element.text}"`,
  );
}

/** Which round the comments belong to: a version under review, or a batch sent while drafting. */
export type FeedbackHeading =
  | { readonly kind: "review"; readonly version: Version }
  | { readonly kind: "draft"; readonly batch: number };

function headingOf(heading: FeedbackHeading): string {
  return heading.kind === "review"
    ? `# Plan review: changes requested (v${heading.version})`
    : `# Drafting feedback ${heading.batch}`;
}

/** The text Claude reads: one numbered item per comment, the place first, the comment under it. */
export function formatFeedback(
  annotations: readonly Annotation[],
  heading: FeedbackHeading,
): string {
  const items = annotations.map((annotation, index) => {
    const doc = `\`${annotation.doc}\``;
    const [first, ...rest] = placesOf(annotation.anchor);

    const where =
      first === undefined
        ? `${doc}, general`
        : rest.length === 0
          ? `${doc} ${first}`
          : `${doc}\n${[first, ...rest].map((place) => `   - ${place}`).join("\n")}`;

    return `${index + 1}. ${where}\n   ${indent(annotation.body)}`;
  });

  return `${headingOf(heading)}\n\n${items.join("\n\n")}\n`;
}
