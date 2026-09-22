/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures and expectations here are branded values (Version, ProjectPath, WipDir) written as literals: the brand is the parser's to grant, and the test is what checks the parser. */
import { expect, test } from "bun:test";

import type { Annotation } from "./feedback.ts";
import { formatFeedback, formatNotes } from "./feedback.ts";

const DOC = "plans/2026-09-15/wip-4c2a9d93/.review/v2.md" as never;

const V2 = { kind: "review", version: 2 as never, editedFrom: null } as const;

const PASSAGE = {
  quote: "persist per user",
  prefix: "",
  suffix: "",
  lines: [14, 14],
  removed: false,
} as const;

test("formatFeedback numbers the comments, quotes text anchors, names general ones", () => {
  const annotations: Annotation[] = [
    {
      id: "a",
      doc: DOC,
      anchor: { kind: "text", passages: [PASSAGE] },
      mark: { kind: "comment", body: "A JSON column is enough.\nOne boolean." },
    },
    {
      id: "b",
      doc: DOC,
      anchor: { kind: "global" },
      mark: { kind: "comment", body: "Slice 2 needs an empty state." },
    },
  ];

  expect(formatFeedback(annotations, V2)).toBe(
    [
      "# Plan review: changes requested (v2)",
      "",
      `1. \`${DOC}\` lines 14–14: "persist per user"`,
      "   A JSON column is enough.",
      "   One boolean.",
      "",
      `2. \`${DOC}\`, general`,
      "   Slice 2 needs an empty state.",
      "",
    ].join("\n"),
  );
});

test("formatFeedback says which lines the reviewer's edit removed, and of which version", () => {
  const gone = { ...PASSAGE, removed: true };

  const annotation: Annotation = {
    id: "a",
    doc: DOC,
    anchor: { kind: "text", passages: [gone] },
    mark: { kind: "comment", body: "Decide this first." },
  };

  expect(
    formatFeedback([annotation], { ...V2, version: 3 as never, editedFrom: 2 as never }),
  ).toContain(
    `1. \`${DOC}\` lines 14–14 of v2 (removed by the reviewer's edit): "persist per user"`,
  );
  expect(formatFeedback([annotation], V2)).toContain(
    `1. \`${DOC}\` lines 14–14 (removed by the reviewer's edit): "persist per user"`,
  );
});

test("formatFeedback lists the passages of a comment that points to several places", () => {
  const annotation: Annotation = {
    id: "a",
    doc: DOC,
    anchor: {
      kind: "text",
      passages: [
        { quote: "First item", prefix: "", suffix: "", lines: [5, 5], removed: false },
        { quote: "Nested two", prefix: "", suffix: "", lines: [7, 7], removed: false },
      ],
    },
    mark: { kind: "comment", body: "These two say the same thing." },
  };

  expect(formatFeedback([annotation], V2)).toBe(
    [
      "# Plan review: changes requested (v2)",
      "",
      `1. \`${DOC}\``,
      '   - lines 5–5: "First item"',
      '   - lines 7–7: "Nested two"',
      "   These two say the same thing.",
      "",
    ].join("\n"),
  );
});

test("formatFeedback names the selector, the label and the text of an element anchor", () => {
  const annotation: Annotation = {
    id: "a",
    doc: DOC,
    anchor: {
      kind: "element",
      elements: [
        {
          selector: "section#pricing > div.card:nth-of-type(2)",
          text: "Pro — $29/mo",
          label: "div.card",
        },
      ],
    },
    mark: { kind: "comment", body: "The price must stand out." },
  };

  expect(formatFeedback([annotation], V2)).toBe(
    [
      "# Plan review: changes requested (v2)",
      "",
      `1. \`${DOC}\` element \`section#pricing > div.card:nth-of-type(2)\` (div.card): "Pro — $29/mo"`,
      "   The price must stand out.",
      "",
    ].join("\n"),
  );
});

test("formatFeedback gives each element of a comment its own bullet", () => {
  const annotation: Annotation = {
    id: "a",
    doc: DOC,
    anchor: {
      kind: "element",
      elements: [
        {
          selector: "#pricing > div.card:nth-of-type(1)",
          text: "Starter $9/mo",
          label: "div.card",
        },
        { selector: "#pricing > div.card:nth-of-type(2)", text: "Pro $29/mo", label: "div.card" },
      ],
    },
    mark: { kind: "comment", body: "The price must stand out on both cards." },
  };

  expect(formatFeedback([annotation], V2)).toBe(
    [
      "# Plan review: changes requested (v2)",
      "",
      `1. \`${DOC}\``,
      '   - element `#pricing > div.card:nth-of-type(1)` (div.card): "Starter $9/mo"',
      '   - element `#pricing > div.card:nth-of-type(2)` (div.card): "Pro $29/mo"',
      "   The price must stand out on both cards.",
      "",
    ].join("\n"),
  );
});

test("a drafting batch is headed by its number, not by a version", () => {
  const annotation: Annotation = {
    id: "a",
    doc: `${DOC}` as never,
    anchor: { kind: "global" },
    mark: { kind: "comment", body: "The empty state is missing." },
  };

  expect(formatFeedback([annotation], { kind: "draft", batch: 3 })).toStartWith(
    "# Drafting feedback 3\n\n1. ",
  );
});

type Passages = Extract<Annotation["anchor"], { readonly kind: "text" }>["passages"];

function marked(mark: Annotation["mark"], passages: Passages = [PASSAGE]): string {
  const annotation = { id: "a", doc: DOC, anchor: { kind: "text", passages }, mark } as const;

  return formatFeedback([annotation], V2);
}

test("a delete mark prints Delete this. under its place", () => {
  expect(marked({ kind: "delete" })).toBe(
    [
      "# Plan review: changes requested (v2)",
      "",
      `1. \`${DOC}\` lines 14–14: "persist per user"`,
      "   Delete this.",
      "",
    ].join("\n"),
  );
});

test.each([
  ["clarify", "Clarify this: say what it means in concrete terms."],
  ["verify", "Verify this against the code or the docs, and cite what you read."],
  ["tooMuch", "Overengineered: cut this down to what the request needs."],
  ["missingCheck", "Nothing closes this: add the check that proves it."],
] as const)("the label %s prints its sentence, and nothing else", (label, sentence) => {
  expect(marked({ kind: "label", label })).toEndWith(
    `lines 14–14: "persist per user"\n   ${sentence}\n`,
  );
});

test("a mark on several places prints once, under the list of places", () => {
  const second = {
    quote: "one boolean",
    prefix: "",
    suffix: "",
    lines: [20, 20],
    removed: false,
  } as const;

  expect(marked({ kind: "delete" }, [PASSAGE, second])).toEndWith(
    [
      `1. \`${DOC}\``,
      '   - lines 14–14: "persist per user"',
      '   - lines 20–20: "one boolean"',
      "   Delete this.",
      "",
    ].join("\n"),
  );
});

const EDITED_NOTE =
  "The reviewer edited plan.md directly (v2 → v3): keep those edits. plan.md is now v3: an item that names `.review/v3.md` gives plan.md's lines.";

const V3_EDITED = { kind: "review", version: 3 as never, editedFrom: 2 as never } as const;

test("a review of an edited plan says so under the heading, before the items", () => {
  const anchor = { kind: "text", passages: [PASSAGE] } as const;
  const annotation = { id: "a", doc: DOC, anchor, mark: { kind: "delete" } } as const;

  expect(formatFeedback([annotation], V3_EDITED)).toBe(
    `# Plan review: changes requested (v3)\n\n${EDITED_NOTE}\n\n1. \`${DOC}\` lines 14–14: "persist per user"\n   Delete this.\n`,
  );
});

test("an edit with no comment leaves the heading and that paragraph", () => {
  expect(formatFeedback([], V3_EDITED)).toBe(
    `# Plan review: changes requested (v3)\n\n${EDITED_NOTE}\n`,
  );
});

const NOTES_TITLE = "# Plan approved: the reviewer's notes (v3)";

const READ_AGAIN = "The reviewer edited plan.md directly (v2 → v3): read plan.md again.";

test("formatNotes with neither a note nor an edit is null, a blank note included", () => {
  expect(formatNotes(3 as never, null, "")).toBeNull();
  expect(formatNotes(3 as never, null, " \n")).toBeNull();
});

test("formatNotes with an edit alone says the plan was edited and must be read again", () => {
  expect(formatNotes(3 as never, 2 as never, "")).toBe(`${NOTES_TITLE}\n\n${READ_AGAIN}\n`);
});

test("formatNotes with an edit and a note made of spaces gives the edit line alone", () => {
  expect(formatNotes(3 as never, 2 as never, "  \n")).toBe(`${NOTES_TITLE}\n\n${READ_AGAIN}\n`);
});

test("formatNotes with a note alone gives the note under the title", () => {
  expect(formatNotes(3 as never, null, "Slice 1 only.\n")).toBe(
    `${NOTES_TITLE}\n\nSlice 1 only.\n`,
  );
});

test("formatNotes with an edit and a note gives the edit line, then the note", () => {
  expect(formatNotes(3 as never, 2 as never, "Slice 1 only.")).toBe(
    `${NOTES_TITLE}\n\n${READ_AGAIN}\n\nSlice 1 only.\n`,
  );
});
