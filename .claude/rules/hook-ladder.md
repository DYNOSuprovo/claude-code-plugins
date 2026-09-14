---
paths:
  - ".claude/hooks/**"
  - ".claude/__settings.jsonc"
  - "lefthook.yml"
  - "scripts/run-gates.ts"
  - "scripts/check-lint-config.ts"
---

# Hook ladder

Each rung checks more than the one before, so an agent meets a finding once,
at the end of its turn: post-edit, Stop, pre-commit, pre-push, CI.

- The post-edit hook (`format-on-edit.ts`) formats and never blocks. It hands
  the formatting diff, or the formatter failure, back as PostToolUse
  `additionalContext`. Claude Code renders a Write or Edit result from the
  file path alone, so `updatedToolOutput` cannot carry code there.
- Each in-repo Edit or Write marks the session in
  `os.tmpdir()/claude-code-plugins-stop/<session_id>`; a subagent edit marks
  its parent. The Stop hook (`stop-gates.ts`) runs `scripts/run-gates.ts` for
  a marked session and blocks while a gate is red, `stop_hook_active` or not.
  Plan mode and a background subagent, workflow or teammate are the only
  skips. Claude Code ends a turn after 8 consecutive blocks.
- A new gate is one `EXPECTED_COMMANDS` entry in
  `scripts/check-lint-config.ts`. `lint-config` then demands its pre-commit job
  and its CI step; Stop and pre-push run it through `run-gates.ts`.
- Tests stay out of Stop: the two `bun test` runs take about 30 s here, the
  gates under 3 s. pre-push and CI run them.

Known ceilings:

- Claude Code still adds its own "likely a formatter" note to each reformat,
  right after the diff.
- A diff over 10,000 characters reaches the agent as a file path and a
  preview: Claude Code caps hook output there.
- A write through Bash alone sets no marker, so that turn skips Stop;
  pre-commit and pre-push still check.
- The gates run repo-wide at `CLAUDE_PROJECT_DIR`. Red work of another session
  in the same checkout blocks this session. A session that enters a worktree
  keeps that directory, so its worktree work is not Stop-gated; the hook
  input's `cwd` is the one field that follows the worktree.
- pre-push checks the working tree, not the pushed commits.
