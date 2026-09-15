import { readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

import { rewriteLinks } from "./links.ts";
import type { FinalDir, ParseResult, Slug, WipDir } from "./paths.ts";
import { dateOf, parseFinalDir } from "./paths.ts";

const TEXT_PROBE_BYTES = 8192;

async function freeTarget(project: string, from: WipDir, slug: Slug): Promise<FinalDir> {
  const base = `plans/${dateOf(from)}/${slug}`;

  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? `${base}/` : `${base}-${n}/`;

    if (
      !(await Bun.file(join(project, candidate)).exists()) &&
      !(await isDir(project, candidate))
    ) {
      const parsed = parseFinalDir(candidate);

      if (parsed.ok) return parsed.value;
    }
  }
}

async function isDir(project: string, path: string): Promise<boolean> {
  return (await stat(join(project, path)).catch(() => null))?.isDirectory() ?? false;
}

async function isText(path: string): Promise<boolean> {
  const head = await Bun.file(path).slice(0, TEXT_PROBE_BYTES).bytes();

  return !head.includes(0);
}

async function rewriteTree(root: string, from: WipDir, to: FinalDir): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);

    if (!(await isText(path))) continue;
    const text = await Bun.file(path).text();
    const rewritten = rewriteLinks(text, from, to);

    if (rewritten !== text) await Bun.write(path, rewritten);
  }
}

/** Renames the working directory to its slug (`-2`, `-3` on collision) and rewrites its links in every text file. */
export async function finalize(
  project: string,
  from: WipDir,
  slug: Slug,
): Promise<ParseResult<FinalDir>> {
  if (!(await isDir(project, from))) return { ok: false, error: `${from} is not a directory` };
  const to = await freeTarget(project, from, slug);

  try {
    await rename(join(project, from), join(project, to));
  } catch (cause) {
    return { ok: false, error: `rename ${from} → ${to} failed: ${String(cause)}` };
  }

  await rewriteTree(join(project, to), from, to);

  return { ok: true, value: to };
}
