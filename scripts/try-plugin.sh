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
loaded=()

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
  loaded+=("$1 $(jq -r .version "$dir/.claude-plugin/plugin.json")")
  shift
done

((${#plugin_dirs[@]} > 0)) || usage

dirty=""
[[ -z "$(git -C "$root" status --porcelain)" ]] || dirty=" + uncommitted changes"

echo "plugins from: $root"
echo "commit:       $(git -C "$root" log -1 --format='%h %s')$dirty"
printf 'loaded:       %s\n' "${loaded[@]}"

# A process a plugin spawned detached outlives the session and keeps the code it started with:
# a session that finds it again runs old code beside the new hooks module.
survivors="$(pgrep -af "$root/" | grep -vE '^[0-9]+ (claude |.*try-plugin)' || true)"

if [[ -n $survivors ]]; then
  echo "still alive from an earlier session, on the code of their start time:"

  while read -r pid _; do
    echo "  $pid  started $(ps -o lstart= -p "$pid")  $(ps -o args= -p "$pid" | cut -c1-120)"
  done <<<"$survivors"
fi

echo "debug log:    ~/.claude/debug/latest"
echo "override?     grep 'overrides installed version' ~/.claude/debug/latest"

# `exec` runs the binary, never the owner's `claude` shell function that skips permissions.
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 exec claude --debug --permission-mode default "${plugin_dirs[@]}" "$@"
