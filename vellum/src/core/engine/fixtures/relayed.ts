import { WORKDIR } from "./workdir.ts";

export function relayed(drafts: number, version = 0, workdir: string = WORKDIR) {
  return { workdir, drafts, version };
}
