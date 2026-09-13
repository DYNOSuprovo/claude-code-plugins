import { $ } from "bun";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export const PLAN_MARKER = "<!-- plan -->";

const COMMENT_FIELDS = ".[] | {id: .id, login: .user.login, body: .body}";
const PR_CREATE = /\bgh\s+pr\s+create\b/u;
const PULL_URL = /\/pull\/(\d+)/u;
const SESSION_LINE = /^<!-- session_id: [^\s>]+ -->\n?/u;

export interface HookPayload {
  cwd?: string;
  session_id?: string;
  tool_input?: { command?: string; plan?: string };
  tool_response?: { plan?: string };
}

export interface PlanComment {
  id: number;
  login: string;
  body: string;
}

export function parsePayload(raw: string): HookPayload | null {
  try {
    // SAFETY: the harness owns this shape. Every read is optional, and a payload
    // that does not match yields null, which every caller treats as "nothing to do".
    return JSON.parse(raw) as HookPayload;
  } catch {
    return null;
  }
}

export function planText(payload: HookPayload): string | null {
  const plan = payload.tool_response?.plan ?? payload.tool_input?.plan ?? "";
  return plan.trim().length === 0 ? null : plan;
}

export function isPrCreate(command: string): boolean {
  return PR_CREATE.test(command);
}

export function prNumberFrom(text: string): number | null {
  const number = text.match(PULL_URL)?.[1];
  return number === undefined ? null : Number(number);
}

export function planKey(gitCommonDir: string, branch: string): string | null {
  const repo = basename(dirname(gitCommonDir));
  if (branch.length === 0 || repo.length === 0 || repo === "." || repo === "..") return null;
  return `${repo}/${branch}`;
}

export function planPath(home: string, key: string): string {
  return join(home, ".claude", "plans", "by-branch", `${key}.md`);
}

export function withSessionLine(plan: string, sessionId: string | undefined): string {
  const body = plan.endsWith("\n") ? plan : `${plan}\n`;
  if (sessionId === undefined || sessionId.length === 0) return body;
  return `<!-- session_id: ${sessionId} -->\n${body}`;
}

export function buildBody(plan: string): string {
  const session = plan.match(SESSION_LINE)?.[0].trim() ?? "";
  const header = session.length === 0 ? PLAN_MARKER : `${PLAN_MARKER}\n${session}`;
  const rest = plan.replace(SESSION_LINE, "").trim();
  return `${header}\n<details><summary>Plan</summary>\n\n${rest}\n\n</details>\n`;
}

export function findPlanComment(commentsJsonl: string, login: string): number | null {
  for (const line of commentsJsonl.split("\n")) {
    if (line.trim().length === 0) continue;
    // SAFETY: shaped by COMMENT_FIELDS above; a malformed line throws up to the
    // hook, which reports it on stderr and exits 0.
    const comment = JSON.parse(line) as PlanComment;
    if (comment.login === login && comment.body.startsWith(PLAN_MARKER)) return comment.id;
  }
  return null;
}

type Run = { stdout: string; exitCode: number };

async function git(cwd: string, ...args: string[]): Promise<Run> {
  const { stdout, exitCode } = await $`git ${args}`.cwd(cwd).quiet().nothrow();
  return { stdout: stdout.toString().trim(), exitCode };
}

async function gh(cwd: string, ...args: string[]): Promise<Run> {
  const { stdout, stderr, exitCode } = await $`gh ${args}`.cwd(cwd).quiet().nothrow();
  if (exitCode !== 0) throw new Error(`gh ${args.join(" ")}: ${stderr.toString().trim()}`);
  return { stdout: stdout.toString().trim(), exitCode };
}

export async function planKeyFor(cwd: string): Promise<string | null> {
  const dir = await git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (dir.exitCode !== 0) return null;
  const branch = await git(cwd, "branch", "--show-current");
  if (branch.exitCode !== 0) return null;
  return planKey(dir.stdout, branch.stdout);
}

export async function openPrNumber(cwd: string): Promise<number | null> {
  const { stdout, exitCode } = await $`gh pr view --json number --jq .number`
    .cwd(cwd)
    .quiet()
    .nothrow();
  const number = Number(stdout.toString().trim());
  return exitCode === 0 && Number.isInteger(number) ? number : null;
}

export async function upsertPlanComment(cwd: string, pr: number, plan: string): Promise<void> {
  const login = await gh(cwd, "api", "user", "--jq", ".login");
  const comments = await gh(
    cwd,
    "api",
    `repos/{owner}/{repo}/issues/${pr}/comments`,
    "--paginate",
    "--jq",
    COMMENT_FIELDS,
  );
  const existing = findPlanComment(comments.stdout, login.stdout);
  // Outside the repository: a body file inside it would land in the next commit.
  const file = join(tmpdir(), `plan-comment-${pr}-${process.pid}.md`);
  await Bun.write(file, buildBody(plan));
  try {
    if (existing === null) await gh(cwd, "pr", "comment", String(pr), "--body-file", file);
    else {
      await gh(
        cwd,
        "api",
        "-X",
        "PATCH",
        `repos/{owner}/{repo}/issues/comments/${existing}`,
        "-F",
        `body=@${file}`,
      );
    }
  } finally {
    await rm(file, { force: true });
  }
}
