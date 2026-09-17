import type { ProjectPath, Version } from "./paths.ts";
import { PLAN_FILE, versionFile } from "./workspace.ts";

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

/** The annotations of `from` named on `to` instead: an edit's text is the next version's file, line for line. */
export function retargetAnnotations(
  annotations: readonly Annotation[],
  from: ProjectPath,
  to: ProjectPath,
): readonly Annotation[] {
  return annotations.map((annotation) =>
    annotation.doc === from ? { ...annotation, doc: to } : annotation,
  );
}

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

/**
 * Which round the comments belong to: a version under review, or a batch sent while drafting.
 * `editedFrom` is the version the reviewer edited to make this one, `null` when it is Claude's.
 */
export type FeedbackHeading =
  | { readonly kind: "review"; readonly version: Version; readonly editedFrom: Version | null }
  | { readonly kind: "draft"; readonly batch: number };

/** The heading, then what Claude must know before the items: the plan on disk is the reviewer's own text. */
function openingOf(heading: FeedbackHeading): readonly string[] {
  if (heading.kind === "draft") return [`# Drafting feedback ${heading.batch}`];
  const title = `# Plan review: changes requested (v${heading.version})`;

  if (heading.editedFrom === null) return [title];
  const { version, editedFrom } = heading;

  return [
    title,
    `The reviewer edited ${PLAN_FILE} directly (v${editedFrom} → v${version}): keep those edits. ${PLAN_FILE} is now v${version}: an item that names \`${versionFile(version)}\` gives ${PLAN_FILE}'s lines.`,
  ];
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

  return `${[...openingOf(heading), ...items].join("\n\n")}\n`;
}
