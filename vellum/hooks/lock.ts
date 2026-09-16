import type { HookFailure, ResultOf } from "claude-code";

import { editedPath, type ProjectDir, type Workdir } from "./parse.ts";

/**
 * `allow` runs the call whatever the session's mode, `check` hands it to the session's own
 * permission flow, `deny` refuses it with the reason the model reads.
 */
export type Verdict =
  | { readonly kind: "allow" }
  | { readonly kind: "check" }
  | { readonly kind: "deny"; readonly reason: string };

/** Absolute, `.` and `..` folded: a relative path resolves against the session's directory. */
function resolvePath(cwd: string, path: string): string {
  const segments: string[] = [];

  for (const segment of (path.startsWith("/") ? path : `${cwd}/${path}`).split("/")) {
    if (segment === "" || segment === ".") continue;

    if (segment === "..") segments.pop();
    else segments.push(segment);
  }

  return `/${segments.join("/")}`;
}

/**
 * While vellum plans, the files a call may write are the working directory's, and it writes
 * them outright, since the directory is vellum's own and the page shows every file in it.
 * A file outside the project is no change to the codebase, so the session's own scratchpad
 * goes through. Every other tool goes to the session's flow, so reads are untouched.
 */
export function lockVerdict(
  tool: string,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- `input` is the call's arguments as `tool.check` hands them over (`ToolCheckInput.input: unknown`); `editedPath`, in the boundary parser, is what reads them.
  input: unknown,
  cwd: string,
  project: ProjectDir,
  workdir: Workdir,
): Verdict {
  const path = editedPath(tool, input);

  if (path === null) return { kind: "check" };
  const resolved = resolvePath(cwd, path);

  if (!resolved.startsWith(`${resolvePath("/", project)}/`)) return { kind: "allow" };

  return resolved.startsWith(`${resolvePath(project, workdir)}/`)
    ? { kind: "allow" }
    : {
        kind: "deny",
        reason: `vellum is planning: files outside ${workdir} change after the plan is approved`,
      };
}

/**
 * The lock's answer when its own hook failed. A `tool.check` hook that throws or overruns is
 * skipped and what is beneath runs in its place, which opens the lock; this closes it, whether
 * the failure landed before or after `next(e)`.
 */
export function lockFailed(kind: HookFailure["kind"]): ResultOf["tool.check"] {
  return { decision: "deny", reason: `vellum: the lock failed (${kind}); retry the call` };
}

/**
 * A settings allow rule (`Bash(mkdir:*)`) would let a file-modifying command past the lock, as
 * the native plan mode never does: the person decides it instead. The built-in read-only set
 * carries no rule, so `git log` and `ls` still pass.
 */
export function checkVerdict(tool: string, engine: ResultOf["tool.check"]): ResultOf["tool.check"] {
  return tool === "Bash" && engine.decision === "allow" && engine.rule !== undefined
    ? { ...engine, decision: "ask" }
    : engine;
}
