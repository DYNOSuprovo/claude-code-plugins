import type { Host } from "./host.ts";
import type { Landed } from "./lock.ts";
import type { ProjectDir, Workdir } from "./parse.ts";

/**
 * A missing name Windows reads off the folder it seems to be in: `D:x` lands in drive D's own
 * directory, and `C:stream` names a drive or a stream. The engine's guard recipe (`$.fs.stat`
 * in `claude-code.d.ts`) refuses both.
 */
const DRIVE_NAME = /^[A-Za-z]:/u;

/** Rooted on POSIX, on a Windows drive, or on the session's drive without naming it. */
const ROOTED = /^(?:[\\/]|[A-Za-z]:[\\/])/u;

const LAST_SEPARATOR = /[\\/](?=[^\\/]*$)/u;

const TRAILING_SEPARATORS = /[\\/]+$/u;

/**
 * Where a path lands, as the file system answers it: every symbolic link followed, whatever
 * the platform's spelling. A file not written yet lands under the first of its folders that
 * exists. `null` when nothing can tell: a link that leads nowhere, a network or device path,
 * a name Windows reads as a drive. The lock denies on `null`, since the tool may still open it.
 */
export async function placed(host: Host, path: string): Promise<string | null> {
  const missing: string[] = [];
  let rest = path;

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a folder is asked only once what it holds is known to be missing.
    const found = await host.stat(rest).catch(() => null);

    if (found !== null) {
      return found.realPath === undefined
        ? null
        : [found.realPath.replace(TRAILING_SEPARATORS, ""), ...missing].join("/");
    }

    const named = rest.replace(TRAILING_SEPARATORS, "");
    const cut = named.search(LAST_SEPARATOR);
    const name = named.slice(cut + 1);

    if (name === "" || name === "." || name === ".." || DRIVE_NAME.test(name)) return null;
    missing.unshift(name);
    rest = cut < 0 ? "." : named.slice(0, cut + 1);
  }
}

/**
 * Where a call's file, the project and the working directory land. A relative path hangs off
 * the session's directory, read for that path alone. A project that lands nowhere throws, and
 * the lock fails closed on it.
 */
export async function landed(
  host: Host,
  session: { readonly project: ProjectDir; readonly workdir: Workdir },
  path: string,
): Promise<Landed> {
  const project = await placed(host, session.project);

  if (project === null) throw new Error(`the project ${session.project} lands nowhere`);

  return {
    file: await placed(
      host,
      ROOTED.test(path) ? path : `${(await host.cwd()).replace(TRAILING_SEPARATORS, "")}/${path}`,
    ),
    project,
    workdir: await placed(host, `${session.project}/${session.workdir}`),
  };
}
