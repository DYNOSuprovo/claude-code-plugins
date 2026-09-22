# Local checks and CI

[Repo operations index](../repo-ops.md). Read when a gate fails or when the validation machinery changes.

## Local enforcement

The checks run as a ladder, from each edit to CI: the Claude Code post-edit fixer and formatter, the Stop gates, `pre-commit`, `pre-push`, then CI.

- lefthook `pre-commit`, 14 jobs in order: `block-commit-to-main`, `block-settings-json`, `sync-settings`, `sync-versions` (auto-fix), `validate-marketplace`, `validate-frontmatter`, then the six repo-wide gates `lint-config`, `typecheck`, `lint-ts`, `fmt`, `lint-sh`, `check-lint-disables`, then `validate-vellum` and `test-vellum` on the module's paths (`vellum/hooks/*`, `vellum/src/core/engine/**`, the manifest). Only the mutating jobs are order-bound: they run before the jobs that validate what they wrote. `commit-msg`: 1 job, `block-ai-signatures`. Escape hatch for recovery only: `MAIN_BYPASS=1`.
- lefthook `pre-push`, 1 script job, `gates-and-tests` (`.lefthook/pre-push/gates-and-tests.sh`): `scripts/run-gates.ts`, every gate unscoped as CI runs it, then both `bun test` runs. It first unsets the variables `git rev-parse --local-env-vars` lists: a push from a linked worktree exports `GIT_DIR`, which would send the suites' temp-repo commits to the pushing repo. A script, not a `run` job, because lefthook skips or fails a pre-push `run` job on its pushed-files lookup (reason in `lefthook.yml`). It checks the working tree, not the pushed commits.
- CI parity: the six tooling gates and `validate-marketplace.ts` run again in CI with the same arguments. `validate-frontmatter.ts` runs on staged files in `pre-commit`, with `--all` in `pre-push` and CI. Neither `bun test` command runs in `pre-commit`; the hooks module's kit (`test-vellum`, `claude plugin test vellum`) does, when a staged path matches its glob.
- CI's Claude Code: `jdx/mise-action` caches installs under the hash of `mise.toml`, so `claude = "latest"` stays where the cache first resolved it. The step after it runs `mise upgrade claude` and prints the version, since the hooks module's kit runs on the engine and `vellum/types/claude-code.d.ts` follows the local one. A kit red in CI and green locally: compare that printed version with `claude --version` first.
- Claude Code PreToolUse hooks: `.claude/hooks/guard-main-branch.ts` (no commit/push on a `main` checkout), `.claude/hooks/guard-git-push.ts` (no push targeting `main`, no force push targeting `dev` — the rulesets accept both, so only the hook refuses them agent-side). Both police the repo their file lives in, linked worktrees included, whatever `CLAUDE_PROJECT_DIR` says; a command aimed at another repo, by a leading `cd` or by the hook's cwd, passes. `git -C <path>` is not read.
- Claude Code PostToolUse and Stop hooks: `.claude/hooks/format-on-edit.ts` applies oxlint's safe fixes to each edited file, formats it and never blocks; `.claude/hooks/stop-gates.ts` runs `scripts/run-gates.ts` at the end of a turn that edited the repo and blocks while a gate is red, once per verdict when nothing was edited since the last block. Contract and ceilings: `.claude/rules/hook-ladder.md`.

## CI

Triggers on `pull_request` to `main`/`dev` and on `push` to `dev` and `main`. `main` is in the push list as a backstop: a ref update reaching it outside the release path still gets validated. The guard checks that `main` is an ancestor of `dev` (`git merge-base --is-ancestor`): `main` must always be a fast-forward prefix of `dev`.
