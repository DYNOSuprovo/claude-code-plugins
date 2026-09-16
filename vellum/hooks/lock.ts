import type { HookFailure, ResultOf } from "claude-code";

import type { ProjectDir, Workdir } from "./parse.ts";

/**
 * `allow` runs the call whatever the session's mode, `check` hands it to the session's own
 * permission flow, `deny` refuses it with the reason the model reads.
 */
export type Verdict =
  | { readonly kind: "allow" }
  | { readonly kind: "check" }
  | { readonly kind: "deny"; readonly reason: string };

/** The project's prefix; a project at `/` owns every path. */
function projectPrefix(project: ProjectDir): string {
  const root = resolvePath("/", project);

  return root === "/" ? "/" : `${root}/`;
}

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
 * A file outside the project is no change to the codebase, so the session's own flow decides
 * it, as it does for `Bash`: the scratchpad passes there without a prompt, and a write to a
 * home or system file still asks. Every other tool goes to that flow too, so reads are
 * untouched.
 */
export function lockVerdict(
  path: string,
  cwd: string,
  project: ProjectDir,
  workdir: Workdir,
): Verdict {
  const resolved = resolvePath(cwd, path);

  if (!resolved.startsWith(projectPrefix(project))) return { kind: "check" };

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
  return { decision: "deny", reason: `the lock failed (${kind}); retry the call` };
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
