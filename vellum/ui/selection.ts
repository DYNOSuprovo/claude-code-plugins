/** How a clicked target sits against one already chosen. */
export type Relation = "same" | "overlapping" | "separate";

/** Which chosen targets survive a Ctrl+click, and whether the clicked one joins them. */
export type SelectionUpdate = { readonly keep: readonly number[]; readonly add: boolean };

/** A Ctrl+click: the same target leaves the set, an overlapping one is replaced, anything else joins. */
export function nextSelection(relations: readonly Relation[]): SelectionUpdate {
  return {
    keep: relations.flatMap((relation, index) => (relation === "separate" ? [index] : [])),
    add: !relations.includes("same"),
  };
}
