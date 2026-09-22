# Skill permissions and prompts

[Plugin testing index](../plugin-testing.md). Read when a skill command prompts, fails before launch or needs a prompt audit.

## Skill mechanics worth knowing

- `` !`cmd` `` interpolation works in `SKILL.md`. The permission check walks
  every head of a compound command; its error names the blocking part
  (`test` in `test -f … && echo …`), the rest already passed.
- A fenced ```` ```! ```` block runs its whole body as one bash script:
  multi-line pipelines and `#` comments work, and only stdout reaches the
  model. A non-zero exit aborts the skill; end the pipeline with `|| true`.
- That permission check also applies the Bash tool's shell-safety
  heuristics, and `allowed-tools` cannot override them. A brace next to a
  quote is "expansion obfuscation"; a backslash-newline is "backslash-escaped
  whitespace". Either aborts the skill before the model runs, with the reason
  in the transcript's `<local-command-stderr>` row, not on stderr.
- `Bash(*:*)` does not grant a bundled-script call: `:*` is a trailing
  wildcard, so it reads as `Bash(* *)`, a literal-star prefix. `Bash(*)` is
  the match-all form; `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/x *)` the narrow
  one. Auto-approving modes hide the gap; only `default` mode shows it.
- File rules take gitignore paths, and only `Read(path)` and `Edit(path)` are
  consulted; `Edit` covers `Write`. `Write(*:*)` grants nothing: a Write to
  `/tmp` still prompts in `default` mode. An absolute path needs two slashes,
  `Edit(//tmp/name*)`, and an allow rule on a symlinked path such as macOS
  `/tmp` needs the target to match too; `Edit(~/.cache/x/**)` avoids both.
  Source: https://code.claude.com/docs/en/permissions#read-and-edit.
- `${CLAUDE_PLUGIN_ROOT}` expands in `Bash(...)` rules only:
  `Read(${CLAUDE_PLUGIN_ROOT}/x)` matches nothing. A plugin file outside the
  working directory prompts on `Read`, installed cache included. An installed
  copy is reachable with `Read(~/.claude/plugins/cache/*/<plugin>/*/<path>)`;
  a `--plugin-dir` session still prompts.
- A `Bash` rule approves the command, not its path arguments. `cat`, `ls`,
  `grep`, `cmp` and `file` on a path outside the working directories stay
  blocked until a `Read(path)` rule covers it; an `Edit(path)` rule alone
  does not. `cp` needs `Edit(path)` on its source as well, and a flag
  (`cp -f`) prompts whatever the rules say. `ls -l` on a
  symlink also checks the link target; `readlink` does not.
- Past the executable, quotes in a rule are literal:
  `Bash(ln -sf "${CLAUDE_PLUGIN_ROOT}/x" *)` matches only the quoted command.
  A rule quoted around the executable, `Bash("${CLAUDE_PLUGIN_ROOT}/x":*)`,
  misses a command continued over `\` line breaks;
  `Bash(${CLAUDE_PLUGIN_ROOT}/x *)` matches the quoted executable on one line
  or several.
- A write under `.claude/` prompts whatever `allowed-tools` says:
  `Edit(./.claude/**)` grants nothing there, and a `cp` out of the installed
  plugin cache counts as one. `ln -s` from the cache passes.
- `Read`, `Grep`, `Glob`, `Agent` and `AskUserQuestion` need no approval in
  the working directory, so `Grep(*:*)`, `Glob(*:*)`, `Agent(*:*)` and
  `AskUserQuestion(*:*)` grant nothing.
  Source: https://code.claude.com/docs/en/tools-reference.
- An `allow` rule stops at a leading environment assignment.
  `Bash(git rebase:*)` never matches `GIT_SEQUENCE_EDITOR=x git rebase`, in
  `default` mode it prompts every time; only a fixed known-safe list
  (`NODE_ENV`-style) is stripped, and `deny`/`ask` rules match past any
  assignment. Keep the executable first: `git -c sequence.editor=x rebase`
  matches `Bash(git -c sequence.editor=:*)`.
  Source: https://code.claude.com/docs/en/permissions#process-wrappers.
- The session exports `GIT_EDITOR=true`. It outranks `-c core.editor`, so a
  `core.editor="cp msg"` override never runs and a squash keeps git's
  concatenated message. Set the message from the todo instead:
  `sed -e '/^squash <h>/a exec git commit --amend -F <file>'`.
- `$(...)` in a command prompts in `default` mode even under a matching rule
  ("Contains command_substitution"). The model copies example commands as
  written, so `git branch backup-$(date +%s)` in a skill is a prompt on
  every run.
- `${CLAUDE_PLUGIN_ROOT}` is substituted in `SKILL.md` at load, never in a
  file the model opens with `Read`. Sibling phase files must locate the
  plugin root relative to the skill base directory the harness prints.
- `disable-model-invocation: true` on a skill removes its description from
  model context; commands and model-invocable skills keep theirs loaded in
  every session. Phase files opened with `Read` cost zero standing context,
  which is why git-sweep carries `audit.md`/`apply.md` instead of commands.
- An installed plugin is the source tree copied verbatim into
  `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, executable
  bits included. A layout that works under `--plugin-dir` works installed.

## Prompt audit

`/claude-api prompt-audit "<plugin>/skills"` finds text written for an
older model or an older backend: fossil sentences, hardcoded depths, gold
outputs the model copies, descriptions without a trigger clause.
Run it on a plugin before its release bump; apply only the hunks a [test session](sessions.md) confirms. Skills here are written by agents under the owner's
prompting, so no line carries an author's measured intent: a recent commit
date does not exempt a pattern, numeric length caps included.
