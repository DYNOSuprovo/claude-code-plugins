import type { HookFailure, ResultOf } from "claude-code";

import type { Workdir } from "./parse.ts";

/**
 * `allow` runs the call whatever the session's mode, `check` hands it to the session's own
 * permission flow, `deny` refuses it with the reason the model reads.
 */
export type Verdict =
  | { readonly kind: "allow" }
  | { readonly kind: "check" }
  | { readonly kind: "deny"; readonly reason: string };

/** Where `\` separates names, as `/` does, or is a character of one. */
export type Platform = "posix" | "windows";

/**
 * Where the call's file and the project land, as `placed` answers them: `file` is `null` when
 * nothing can tell.
 */
export type Landed = {
  readonly file: string | null;
  readonly project: string;
  readonly platform: Platform;
};

/** `realPath` answers the platform's own separator, and `placed` joins a missing tail with `/`. */
const SEPARATORS = { posix: /\/+/gu, windows: /[\\/]+/gu } as const;

/** One spelling to compare: `/` alone between segments and none at the end, so `/` is `""`. */
function spelled(path: string, platform: Platform): string {
  const joined = path.replaceAll(SEPARATORS[platform], "/");

  return joined.endsWith("/") ? joined.slice(0, -1) : joined;
}

function holds(root: string, file: string): boolean {
  return file.startsWith(`${root}/`);
}

/**
 * While vellum plans, the files a call may write are the working directory's, and it writes
 * them outright, since the directory is vellum's own and the page shows every file in it.
 * A file outside the project is no change to the codebase, so the session's own flow decides
 * it, as it does for `Bash`: the scratchpad passes there without a prompt, and a write to a
 * home or system file still asks. Every other tool goes to that flow too, so reads are
 * untouched.
 *
 * The verdict compares where the paths land, so a symbolic link, a `..` or a platform's other
 * spelling of a file is already that file. The working directory is the project's own: where
 * the project lands, then `workdir` as written, so a link on the way to it, or the directory
 * itself a link, leads out of it and allows nothing. `realPath` keeps a case alias as written:
 * the allow compares as written and the deny folds the case, so on a volume that folds it
 * (NTFS, APFS) another case never takes a project file to the session's flow. Where the case
 * counts, the cost is a deny on `/work/PROJ` beside a project at `/work/proj`. A file that
 * lands nowhere known is denied, since the tool may still open it.
 */
export function lockVerdict(path: string, workdir: Workdir, landed: Landed): Verdict {
  if (landed.file === null) {
    return {
      kind: "deny",
      reason: `vellum is planning and cannot tell where ${path} lands; name the file by its full path`,
    };
  }

  const file = spelled(landed.file, landed.platform);
  const project = spelled(landed.project, landed.platform);

  if (holds(spelled(`${project}/${workdir}`, landed.platform), file)) return { kind: "allow" };

  return holds(project.toLowerCase(), file.toLowerCase())
    ? {
        kind: "deny",
        reason: `vellum is planning: files outside ${workdir} change after the plan is approved`,
      }
    : { kind: "check" };
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
 * The tools that run a shell command. The engine offers `PowerShell` beside `Bash`, by default
 * on Windows, and its docs tell a hook that inspects shell commands to match `Bash|PowerShell`.
 */
const SHELLS: ReadonlySet<string> = new Set(["Bash", "PowerShell"]);

/**
 * A settings allow rule (`Bash(mkdir:*)`, `PowerShell(Set-Content:*)`) would let a
 * file-modifying shell command past the lock, as the native plan mode never does: the person
 * decides it instead. The built-in read-only set carries no rule, so `git log` and `ls` still
 * pass.
 */
export function checkVerdict(tool: string, engine: ResultOf["tool.check"]): ResultOf["tool.check"] {
  return SHELLS.has(tool) && engine.decision === "allow" && engine.rule !== undefined
    ? { ...engine, decision: "ask" }
    : engine;
}
