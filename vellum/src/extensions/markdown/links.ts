import type { GroupedDoc } from "../../core/protocol.ts";
import type { ProjectPath } from "../../core/server/domain/paths.ts";

/** The plan as a link target: the version the reviewer reads, and the working copy it was taken from. */
export type PlanTarget = {
  readonly doc: ProjectPath;
  readonly workingCopy: ProjectPath;
};

/**
 * The document a link names, or `null` for the new tab its anchor already carries. A target is
 * the plan's author's own spelling, so a path names any document ending on its whole segments.
 * The working copy leaves the listed documents once a version exists, and there a link to it
 * names the version the reviewer reads.
 */
export function linkedDoc(
  wanted: string,
  docs: readonly GroupedDoc[],
  plan: PlanTarget | null,
): ProjectPath | null {
  const listed = docs.find((doc) => names(doc.path, wanted));

  if (listed !== undefined) return listed.path;

  return plan !== null && names(plan.workingCopy, wanted) ? plan.doc : null;
}

function names(path: string, wanted: string): boolean {
  return path === wanted || path.endsWith(`/${wanted}`);
}
