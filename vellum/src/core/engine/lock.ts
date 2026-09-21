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
function projectPrefix(project: string): string {
  const root = resolvePath("/", project);

  return root === "/" ? "/" : `${root}/`;
}

/** A project Claude Code runs on Windows is named by its drive: `C:\…` or `C:/…`. */
const WINDOWS = /^[A-Za-z]:[\\/]/u;

/**
 * Windows spells one file several ways: `\` or `/`, any case, since NTFS folds it, and rooted
 * on the session's drive without naming it, or long (`\\?\C:\…`). Each becomes one POSIX
 * spelling with the drive as its first segment, so the prefixes compare. The long prefix is
 * dropped before a drive only: `\\?\UNC\…` is a share, never under the project.
 *
 * A pure function cannot see every alias: a short 8.3 name (`PROJEC~1`) or an administrative
 * share (`\\localhost\C$\…`) reaches a file under the project and is read as outside it, and
 * `toLowerCase` only approximates the NTFS case table outside ASCII.
 */
function windowsSpelling(path: string, drive: string): string {
  const spelled = path
    .replaceAll("\\", "/")
    .toLowerCase()
    .replace(/^\/\/\?\/(?=[a-z]:\/)/u, "");

  if (WINDOWS.test(spelled)) return `/${spelled}`;

  return spelled.startsWith("/") ? `/${drive}${spelled}` : spelled;
}

/** How the lock spells a path: as written on POSIX, in one spelling on a Windows project. */
function spellingOf(project: ProjectDir, cwd: string): (path: string) => string {
  if (!WINDOWS.test(project)) return (path) => path;

  const drive = (WINDOWS.test(cwd) ? cwd : project).slice(0, 2).toLowerCase();

  return (path) => windowsSpelling(path, drive);
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
  const spell = spellingOf(project, cwd);
  const root = spell(project);
  const resolved = resolvePath(spell(cwd), spell(path));

  if (!resolved.startsWith(projectPrefix(root))) return { kind: "check" };

  return resolved.startsWith(`${resolvePath(root, spell(workdir))}/`)
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
