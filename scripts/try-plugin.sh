#!/usr/bin/env bash
# Launches a debug Claude Code session on plugins read from source, in the checkout or worktree
# the command is run from: this script may live in another checkout than the plugins it loads.
#
#   scripts/try-plugin.sh <plugin>... [-- <claude args>]
#
# Why each flag is there: docs/plugin-testing.md, "Launch a test session".
set -euo pipefail

usage() {
  echo "usage: try-plugin.sh <plugin>... [-- <claude args>]" >&2
  exit 2
}

root="$(git rev-parse --show-toplevel)"
plugin_dirs=()

while (($# > 0)); do
  if [[ $1 == "--" ]]; then
    shift
    break
  fi

  dir="$root/$1"

  if [[ ! -f "$dir/.claude-plugin/plugin.json" ]]; then
    echo "try-plugin: no plugin at $dir" >&2
    exit 1
  fi

  # Claude Code installs a plugin's dependencies at its cache; under --plugin-dir nothing does.
  if [[ -f "$dir/package.json" ]]; then
    bun install --cwd "$dir" --frozen-lockfile >/dev/null
  fi

  plugin_dirs+=(--plugin-dir "$dir")
  shift
done

((${#plugin_dirs[@]} > 0)) || usage

echo "plugins from: $root"
echo "debug log:    ~/.claude/debug/latest"
echo "override?     grep 'overrides installed version' ~/.claude/debug/latest"

# `exec` runs the binary, never the owner's `claude` shell function that skips permissions.
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 exec claude --debug --permission-mode default "${plugin_dirs[@]}" "$@"
