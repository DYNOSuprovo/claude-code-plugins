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

export type QuickLabel = "clarify" | "verify" | "tooMuch" | "missingCheck";

/** The reviewer's four fixed labels: the name the page shows, the sentence Claude acts on. */
export const QUICK_LABELS = {
  clarify: { name: "Clarify", sentence: "Clarify this: say what it means in concrete terms." },
  verify: {
    name: "Verify",
    sentence: "Verify this against the code or the docs, and cite what you read.",
  },
  tooMuch: {
    name: "Too much",
    sentence: "Overengineered: cut this down to what the request needs.",
  },
  missingCheck: {
    name: "Missing check",
    sentence: "Nothing closes this: add the check that proves it.",
  },
} satisfies Record<QuickLabel, { readonly name: string; readonly sentence: string }>;

export function isQuickLabel(value: string): value is QuickLabel {
  return Object.hasOwn(QUICK_LABELS, value);
}

export const DELETE_SENTENCE = "Delete this.";

/** What the reviewer says about a place: words of their own, "delete this", or a label whose `body` may be empty. */
export type Mark =
  | { readonly kind: "comment"; readonly body: string }
  | { readonly kind: "delete" }
  | { readonly kind: "label"; readonly label: QuickLabel; readonly body: string };

export type Annotation = {
  readonly id: string;
  readonly doc: ProjectPath;
  readonly anchor: Anchor;
  readonly mark: Mark;
};

function indent(words: string): string {
  return words.trim().split("\n").join("\n   ");
}

/** The mark in words Claude acts on: a label is its sentence, then the reviewer's detail when there is one. */
function wordsOf(mark: Mark): string {
  if (mark.kind === "comment") return mark.body;

  if (mark.kind === "delete") return DELETE_SENTENCE;
  const { sentence } = QUICK_LABELS[mark.label];

  return mark.body.trim() === "" ? sentence : `${sentence}\n${mark.body}`;
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

/** The text Claude reads: one numbered item per annotation, the place first, the mark in words under it. */
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

    return `${index + 1}. ${where}\n   ${indent(wordsOf(annotation.mark))}`;
  });

  return `${headingOf(heading)}\n\n${items.join("\n\n")}\n`;
}
