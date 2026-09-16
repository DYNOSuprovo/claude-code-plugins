/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- fixtures and expectations here are branded values (Version, ProjectPath, WipDir) written as literals: the brand is the parser's to grant, and the test is what checks the parser. */
import { expect, test } from "bun:test";

import type { Annotation } from "./feedback.ts";
import { formatFeedback } from "./feedback.ts";

const DOC = "plans/2026-09-15/wip-4c2a9d93/.review/v2.md" as never;

const PASSAGE = { quote: "persist per user", prefix: "", suffix: "", lines: [14, 14] } as const;

test("formatFeedback numbers the comments, quotes text anchors, names general ones", () => {
  const annotations: Annotation[] = [
    {
      id: "a",
      doc: DOC,
      anchor: { kind: "text", passages: [PASSAGE] },
      body: "A JSON column is enough.\nOne boolean.",
    },
    { id: "b", doc: DOC, anchor: { kind: "global" }, body: "Slice 2 needs an empty state." },
  ];

  expect(formatFeedback(annotations, { kind: "review", version: 2 as never })).toBe(
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

test("formatFeedback lists the passages of a comment that points to several places", () => {
  const annotation: Annotation = {
    id: "a",
    doc: DOC,
    anchor: {
      kind: "text",
      passages: [
        { quote: "First item", prefix: "", suffix: "", lines: [5, 5] },
        { quote: "Nested two", prefix: "", suffix: "", lines: [7, 7] },
      ],
    },
    body: "These two say the same thing.",
  };

  expect(formatFeedback([annotation], { kind: "review", version: 2 as never })).toBe(
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
    body: "The price must stand out.",
  };

  expect(formatFeedback([annotation], { kind: "review", version: 2 as never })).toBe(
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
    body: "The price must stand out on both cards.",
  };

  expect(formatFeedback([annotation], { kind: "review", version: 2 as never })).toBe(
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
    body: "The empty state is missing.",
  };

  expect(formatFeedback([annotation], { kind: "draft", batch: 3 })).toStartWith(
    "# Drafting feedback 3\n\n1. ",
  );
});
