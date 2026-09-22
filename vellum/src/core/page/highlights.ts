export type HighlightName = "vellum-comment" | "vellum-draft" | "vellum-focus";

/** Paints `ranges` under `name` with the CSS Custom Highlight API; an empty list clears it. */
export function paint(name: HighlightName, ranges: readonly Range[]): void {
  if (ranges.length === 0) {
    CSS.highlights.delete(name);

    return;
  }

  CSS.highlights.set(name, new Highlight(...ranges));
}
