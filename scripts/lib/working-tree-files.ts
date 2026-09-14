import { $ } from "bun";

/**
 * The working tree's files, as the repo-wide gates read them: tracked files,
 * plus untracked files no ignore rule covers. oxlint, oxfmt and tsgo walk the
 * same set, so a file created but never staged meets every gate at once.
 */
export async function workingTreeFiles(cwd = process.cwd()): Promise<string[]> {
  const listed = await $`git ls-files -z --cached --others --exclude-standard`
    .cwd(cwd)
    .quiet()
    .text();

  return listed.split("\0").filter(Boolean);
}
