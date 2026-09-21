/** How a new place sits against one already chosen. */
export type Relation = "same" | "overlapping" | "separate";

/** Which chosen places survive a place added under Ctrl, and whether the new one joins them. */
export type SelectionUpdate = { readonly keep: readonly number[]; readonly add: boolean };

/** Under Ctrl: the same place leaves the set, an overlapping one is replaced, anything else joins. */
export function nextSelection(relations: readonly Relation[]): SelectionUpdate {
  return {
    keep: relations.flatMap((relation, index) => (relation === "separate" ? [index] : [])),
    add: !relations.includes("same"),
  };
}

/**
 * `a.compareBoundaryPoints(Range.<FIELD>, b)` for each constant, by its own name.
 * The names read backwards: START_TO_END compares a's end with b's start.
 */
export type Bounds = {
  /** `Range.START_TO_START`: a.start against b.start. */
  readonly startToStart: number;
  /** `Range.START_TO_END`: a.end against b.start. */
  readonly startToEnd: number;
  /** `Range.END_TO_END`: a.end against b.end. */
  readonly endToEnd: number;
  /** `Range.END_TO_START`: a.start against b.end. */
  readonly endToStart: number;
};

/** Two places overlap when they share text: one that ends where the other starts shares none. */
export function relationOf(bounds: Bounds): Relation {
  if (bounds.startToStart === 0 && bounds.endToEnd === 0) return "same";

  return bounds.startToEnd === 1 && bounds.endToStart === -1 ? "overlapping" : "separate";
}

function boundsOf(a: Range, b: Range): Bounds {
  return {
    startToStart: a.compareBoundaryPoints(Range.START_TO_START, b),
    startToEnd: a.compareBoundaryPoints(Range.START_TO_END, b),
    endToEnd: a.compareBoundaryPoints(Range.END_TO_END, b),
    endToStart: a.compareBoundaryPoints(Range.END_TO_START, b),
  };
}

/** The set once `one` is added under Ctrl, in document order. */
export function toggled<T extends { readonly range: Range }>(
  chosen: readonly T[],
  one: T,
): readonly T[] {
  const { keep, add } = nextSelection(
    chosen.map((other) => relationOf(boundsOf(other.range, one.range))),
  );

  const next = chosen.filter((_, index) => keep.includes(index));

  return [...next, ...(add ? [one] : [])].toSorted((a, b) =>
    a.range.compareBoundaryPoints(Range.START_TO_START, b.range),
  );
}

export type KeyPress = {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  /** The key went to a field: `input`, `textarea`, `select` or editable content. */
  readonly typing: boolean;
};

/** `c` or `C` alone, pressed once, outside a field. */
export function isSwitchKey(press: KeyPress): boolean {
  return (
    (press.key === "c" || press.key === "C") &&
    !press.ctrlKey &&
    !press.metaKey &&
    !press.altKey &&
    !press.repeat &&
    !press.typing
  );
}

/** Field by field: a spread copies none of a KeyboardEvent's fields, which are getters. */
export function keyPressOf(event: KeyboardEvent): KeyPress {
  const { target } = event;

  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    repeat: event.repeat,
    typing:
      target instanceof HTMLElement &&
      (target.isContentEditable || target.matches("input, textarea, select")),
  };
}
