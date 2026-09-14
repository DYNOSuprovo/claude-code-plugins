# Context Management Plugin

v2.0.0

Lifecycle of Claude Code instruction files: audit the instruction budget of
CLAUDE.md / AGENTS.md / `.claude/rules/`, capture session learnings, and resync docs with
codebase evolution.

Extracted from claude-meta-tools 5.0.0.

## Skills

All three are user-invocable only (`disable-model-invocation: true`). Claude never triggers
them on its own, so their descriptions stay out of your always-on context. Type the slash
command when you want one.

Each one edits the same files, so pick by what drives the change:

| Skill | What it reads | What it changes |
|-------|---------------|-----------------|
| `context-audit` | the context files themselves | quality: budget, anti-patterns, dead references |
| `revise-claude-md` | the current session | adds what this session showed was missing |
| `agent-docs-drift` | `git log` since any agent doc last changed | claims the commits have outgrown |

### `/context-audit`

Audit and improve CLAUDE.md, AGENTS.md and `.claude/rules/` files.

- **Instruction budget**: counts directives across the always-on surface (root + `@`-imports +
  always-on rules + global CLAUDE.md) against the ~100-directive comfortable band
- **Deterministic checks**: stale paths and commands verified against git and `package.json`,
  symlink and import resolution, linter overlap, architecture claims, undocumented env vars
- **Six anti-patterns**: linter overlap, generic advice, verbosity, non-universal scope,
  dead-end negatives, content decay
- **Financed additions**: `ADD` proposals must cite a concrete artefact and are budgeted
  against what the pruning frees
- **No grades**: a directive count is a measurement and is reported; a letter grade is not

```bash
/context-audit                        # every context file in the repo
/context-audit path/to/CLAUDE.md      # one file
```

### `/revise-claude-md`

Capture the current session's learnings (commands, gotchas, patterns) into CLAUDE.md or
`.claude/rules/`, with smart placement and a user approval gate.

### `/agent-docs-drift`

Audit CLAUDE.md, AGENTS.md and `.claude/rules/` against the commits since the newest change to any
of them, then propose commit-motivated updates (`Motivated by: <sha>`). Never auto-commits.

- **Window**: starts at the newest commit touching `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`,
  `AGENTS.override.md` or `.claude/rules/`, so a `CLAUDE.md` that only imports `@AGENTS.md` does not
  stretch it
- **Zones**: changed paths grouped by area; above 30 commits the audit splits by zone before any
  file is read
- **Verdicts**: every doc file gets YES / MINOR / NO backed by a `path:line`; changed zones that no
  rule covers and references to removed code are flagged

The report and its protocol come from a standalone script, so another agent harness can run the
same audit from the repository to check:

```bash
bun <this-checkout>/context-management/scripts/agent-docs-drift.ts
```

## License

MIT

## Author

Augustin BENGOLEA <bengous@protonmail.com>
