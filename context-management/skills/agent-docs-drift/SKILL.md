---
name: agent-docs-drift
description: Audit agent instruction files (CLAUDE.md, AGENTS.md, .claude/rules/) against the commits since any of them last changed, then propose updates each motivated by a commit
disable-model-invocation: true
license: MIT
allowed-tools:
  - Bash("${CLAUDE_PLUGIN_ROOT}/scripts/agent-docs-drift.ts":*)
  - Read
  - Write
  - Edit
  - Agent
  - AskUserQuestion
  - Glob
  - Grep
---

# Agent Docs Drift

Audits CLAUDE.md, AGENTS.md and `.claude/rules/` against the commits since any of them last changed. Never commits: the user commits.

1. Run the report:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/agent-docs-drift.ts"
   ```

   A non-zero exit prints the reason on stderr: relay it and stop. When no doc file is tracked, point the user to `/init`. An empty window: relay the report's result and stop.

2. Follow the report's protocol. In Claude Code:
   - a subagent is an Agent tool call with `subagent_type: Explore`, briefed with the baseline, protocol step 3, the audit set and its share of commits;
   - the approval question is an AskUserQuestion (apply all / cherry-pick / reject);
   - general quality improvement of the docs belongs to `/context-audit`.
