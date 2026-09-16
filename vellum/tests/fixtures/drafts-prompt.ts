import { batch } from "./batch.ts";

export function draftsPrompt(...batches: number[]): string {
  const paths = batches.map((n) => batch(n).path).join(", ");

  return `Drafting feedback from the vellum review page: read ${paths}, revise the files they name, then continue the plan.`;
}
