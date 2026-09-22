/** What the plan reviewer's verdict says, read off its text by `parse.ts`; JSON. */

export type ReviewStatus = "approved" | "issuesFound";

export type Size = "overengineered" | "underengineered" | "right";

/** Where a finding points, as the reviewer wrote it: the quote is the truth, the lines where to look. */
export type Place = { readonly lines: readonly [number, number]; readonly quote: string };

export type Finding = {
  /** The `[section]` the finding names; `null` when it names none. */
  readonly section: string | null;
  readonly text: string;
  /** `null` for a finding about the plan as a whole, or one missing its lines or its quote. */
  readonly place: Place | null;
};

export type Verdict = {
  readonly status: ReviewStatus;
  readonly size: { readonly kind: Size; readonly why: string };
  readonly issues: readonly Finding[];
  readonly advisories: readonly Finding[];
};
