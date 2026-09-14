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
- Each in-repo Edit or Write empties the editing agent's marker,
  `os.tmpdir()/claude-code-plugins-stop/<agent_id ?? session_id>`. The same
  hook (`stop-gates.ts`) runs on Stop and on SubagentStop and runs
  `scripts/run-gates.ts` for a marked agent. Green deletes the marker. Red
  writes the verdict, the report's `Red gates:` line, into the marker and
  blocks, `stop_hook_active` or not. A stop with no edit since that block ends
  the turn on the same verdict, with a `systemMessage` note; a changed verdict
  blocks again. Plan mode and a background subagent, workflow or teammate are
  the only skips. Claude Code ends a turn after 8 consecutive blocks.
- A subagent's payload carries the parent's `session_id` and its own
  `agent_id` (16 hex characters on 2.1.270), so keying the marker on
  `agent_id` first keeps the two independent: a green subagent run leaves the
  parent's mark, a parent verdict does not release a subagent. A SubagentStop
  payload lists the stopping subagent itself in `background_tasks`, so the
  background-task skip applies to Stop only.
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
  field that follows EnterWorktree and a subagent's `isolation: worktree`;
  `CLAUDE_PROJECT_DIR` stays the launching checkout by design. Red work of
  another session in the same checkout blocks this session once per verdict.
- Skipping the background-task check for a subagent assumes no other listed
  task edits that subagent's `cwd`. An isolated subagent has its own worktree
  and a nested one gets another, so only a nested non-isolated subagent
  breaks the assumption; its half-done edit can turn its parent's gates red.
- pre-push checks the working tree, not the pushed commits.
