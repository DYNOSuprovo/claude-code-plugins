import type { PlanWorkspace } from "../protocol.ts";

/** The folder's last segment; "" at the project root, where the column is not drawn. */
export function dirOf(path: string): string {
  return path.split("/").at(-2) ?? "";
}

/** What the plate prints beside `Plan`: `draft` before the first version, `v<n>` after. */
export function planLabel(workspace: PlanWorkspace): string {
  return workspace.kind === "drafting" ? "draft" : `v${workspace.version}`;
}
