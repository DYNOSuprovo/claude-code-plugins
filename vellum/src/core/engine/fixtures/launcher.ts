import type { On, ProcessRunResult } from "claude-code";

import { SERVER } from "./server.ts";

/** What `$.process.run` answers: a launcher that started, or one that could not. */
export type Launch = { value: ProcessRunResult } | { deny: string };

const STARTED: Launch = {
  value: { exitCode: 0, stdout: `${JSON.stringify(SERVER)}\n`, stderr: "" },
};

export function launcher(on: On, answer: Launch = STARTED): (readonly string[])[] {
  const runs: (readonly string[])[] = [];

  on("process.run", (_, e) => {
    runs.push(e.argv);

    return answer;
  });

  return runs;
}
