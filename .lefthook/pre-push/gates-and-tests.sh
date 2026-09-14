#!/usr/bin/env bash
#
# lefthook pre-push: every CI gate, then both test runs, on the working tree.
#
# A push from a linked worktree exports GIT_DIR to this hook. The test suites
# run git in temp repos with the inherited environment: with GIT_DIR still set,
# their commits would land in the pushing repo.

set -euo pipefail

git_env_list="$(git rev-parse --local-env-vars)"
mapfile -t git_env_vars <<<"${git_env_list}"
unset "${git_env_vars[@]}"

bun ./scripts/run-gates.ts

# `bun test` skips dot directories, so the repo's own hooks need their own run.
bun test
bun test ./.claude/hooks/*.test.ts
