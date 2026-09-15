import type { EngineInterface, Register } from "claude-code";

type ServerInfo = { readonly port: number; readonly token: string; readonly pid: number };

type PlanInput = { readonly plan: string; readonly planFilePath: string };

const SPIKE_LOG = "vellum-spike.log";

const FEEDBACK_DELAY_MS = 20_000;

let server: ServerInfo | null = null;

let workdir: string | null = null;

let version = 0;

let approved = false;

async function log($: EngineInterface, line: string): Promise<void> {
  const previous = (await $.fs.exists(SPIKE_LOG)) ? await $.fs.read(SPIKE_LOG) : "";
  await $.fs.write(SPIKE_LOG, `${previous}${new Date().toISOString()} ${line}\n`);
}

/* oxlint-disable anti-slop/no-runtime-typeof -- this IS the boundary parser the rule asks for: `tool_input` arrives as `unknown` from the engine, and there is no earlier place to parse it. */
function isPlanInput(input: unknown): input is PlanInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "plan" in input &&
    typeof input.plan === "string" &&
    "planFilePath" in input &&
    typeof input.planFilePath === "string"
  );
}
/* oxlint-enable anti-slop/no-runtime-typeof */

export const register: Register = (on) => {
  on("skill.prompt", async ($, e, next) => {
    await log($, `skill.prompt skill=${JSON.stringify(e.skill)}`);

    if (e.skill !== "vellum:plan" && e.skill !== "plan") return next(e);

    const id = await $.session.id();
    const date = new Date().toISOString().slice(0, 10);
    workdir = `plans/${date}/wip-${id.slice(0, 8)}/`;
    await $.fs.write(`${workdir}.review/.keep`, "");

    const startedAt = await $.clock.now();

    const run = await $.process.run(
      [
        "bun",
        `${$.plugin.root}/src/cli.ts`,
        "start",
        "--session",
        id,
        "--project",
        await $.session.cwd(),
        "--workdir",
        workdir,
      ],
      { timeoutMs: 10_000 },
    );

    const elapsed = (await $.clock.now()) - startedAt;
    await log(
      $,
      `process.run start exit=${run.exitCode} elapsed=${elapsed}ms stdout=${run.stdout.trim()} stderr=${run.stderr.trim()}`,
    );

    if (run.exitCode === 0) {
      // SAFETY: `start` relays the one line `serve` prints, `{ port, token, pid }`; exit 0 means it printed one.
      server = JSON.parse(run.stdout) as ServerInfo;
      await $.store.set(`session:${id}`, server);

      const probe = await $.http.fetch(`http://127.0.0.1:${server.port}/api/review`, {
        headers: { "x-vellum-token": server.token },
      });

      await log($, `http.fetch /api/review status=${probe.status} text=${probe.text}`);
      $.clock.every(30_000, () => {
        if (server === null) return;
        void $.http.fetch(`http://127.0.0.1:${server.port}/api/heartbeat`, {
          method: "POST",
          headers: { "x-vellum-token": server.token },
        });
      });
    }

    const result = await next(e);

    return { text: `${result.text}\n\nWorking directory: ${workdir}` };
  });

  on("classic.PermissionRequest", { tool_name: "ExitPlanMode" }, async ($, e, next) => {
    await log($, `PermissionRequest agent_id=${e.agent_id ?? "-"} workdir=${workdir ?? "-"}`);

    if (e.agent_id !== undefined || workdir === null || !isPlanInput(e.tool_input)) {
      return next(e);
    }

    if (approved) {
      await log($, `allow v${version} with updatedInput and setMode default`);
      $.ui.status(undefined);

      return {
        decision: {
          behavior: "allow",
          updatedInput: {
            ...e.tool_input,
            plan: `${e.tool_input.plan}\n\nVELLUM-APPROVED-MARKER v${version}\n`,
          },
          updatedPermissions: [{ type: "setMode", mode: "default", destination: "session" }],
        },
      };
    }

    version += 1;
    const current = version;
    await $.fs.write(`${workdir}.review/v${current}.md`, e.tool_input.plan);
    $.ui.status(`plan v${current} under review`);

    $.clock.after(FEEDBACK_DELAY_MS, () => {
      if (current === 1) {
        void $.fs
          .write(
            `${workdir}.review/v${current}.feedback.md`,
            `# Plan review: changes requested (v${current})\n\n1. \`plan\`, general\n   Step 3 says "verify" without saying how. Name the command that reads the file back and the exact content it must show.\n`,
          )
          .then(() =>
            $.prompt.submit({
              text: `Plan review v${current}: changes requested. Read ${workdir}.review/v${current}.feedback.md, revise the plan, then call ExitPlanMode.`,
            }),
          )
          .then((result) => log($, `prompt.submit feedback result=${JSON.stringify(result)}`));
      } else {
        approved = true;
        void $.prompt
          .submit({
            text: `Plan v${current} was approved in the browser. Call ExitPlanMode again with the same plan.`,
          })
          .then((result) => log($, `prompt.submit approved result=${JSON.stringify(result)}`));
      }
    });

    return {
      decision: {
        behavior: "deny",
        message: `Plan v${current} is open for review in the browser. End your turn; the review arrives as a new prompt.`,
      },
    };
  });
};
