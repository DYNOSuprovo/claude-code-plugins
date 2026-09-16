import { WORKDIR } from "./workdir.ts";

export function batch(n: number) {
  return { batch: n, path: `${WORKDIR}.review/v0.feedback-${n}.md` };
}
