---
paths:
  - ".claude/hooks/**"
  - ".claude/__settings.jsonc"
  - "lefthook.yml"
  - ".lefthook/**"
  - "scripts/run-gates.ts"
  - "scripts/check-lint-config.ts"
---

# Hook ladder

The rungs run from each edit to CI: post-edit, Stop, pre-commit, pre-push,
CI. An agent meets a finding once, at the end of its turn, not on each edit.

- The post-edit hook (`format-on-edit.ts`) formats and never blocks. It hands
  the formatting diff, or the formatter failure, back as PostToolUse
  `additionalContext`. Claude Code renders a Write or Edit result from the
  file path alone, so `updatedToolOutput` cannot carry code there.
- Each in-repo Edit or Write empties the session's marker,
  `os.tmpdir()/claude-code-plugins-stop/<session_id>`; a subagent edit marks
  its parent. The Stop hook (`stop-gates.ts`) runs `scripts/run-gates.ts` for
  a marked session. Green deletes the marker. Red writes the verdict, the
  report's `Red gates:` line, into the marker and blocks, `stop_hook_active`
  or not. A Stop with no edit since that block ends the turn on the same
  verdict, with a `systemMessage` note; a changed verdict blocks again. Plan
  mode and a background subagent, workflow or teammate are the only skips.
  Claude Code ends a turn after 8 consecutive blocks.
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
- The gates run repo-wide in the checkout around the hook's `cwd`, the one
  field that follows EnterWorktree; `CLAUDE_PROJECT_DIR` stays the main
  checkout by design. Red work of another session in the same checkout blocks
  this session once per verdict.
- A worktree-isolated subagent's edits mark its parent session, whose Stop
  gates the parent's checkout, and no hook runs at SubagentStop. That
  worktree meets the gates at its own pre-commit and pre-push only. Issue #88.
- pre-push checks the working tree, not the pushed commits.
