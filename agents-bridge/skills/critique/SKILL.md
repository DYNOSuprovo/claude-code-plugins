---
name: critique
description: Critical second opinion from Codex (OpenAI) on a proposal Claude just made — confirms what is sound, challenges what is genuinely weak, and suggests a better path with clear reasoning when one exists. Constructive, not contrarian. Use to cross-check a Claude design, refactor, API, or fix with a non-Claude model before acting on it.
argument-hint: [what to critique / extra focus]
allowed-tools:
  - Bash(mkdir *)
  - Bash(mktemp *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/codex *)
  - Bash(jq *)
  - Read(~/.cache/agents-bridge/critique/**)
  - Edit(~/.cache/agents-bridge/critique/**)
---

# Cross-model critique

A second pair of eyes from a non-Claude model (Codex) on a proposal
**Claude just made** — a design, refactor, API, or fix. Goal: a genuine
cross-model check. Validate what holds up, challenge what is weak, surface a
better path when one exists. Not a rubber stamp, not reflexive contrarianism.

## When to use

- Claude (this instance or another) proposed a solution and you want it
  pressure-tested before committing.
- You said "not bad, right?" and actually want the honest answer.
- A decision has real forks and one outside viewpoint would de-risk it.

NOT for reviewing local git changes — use `/agents-bridge:adversarial-review`.
It reads the **git diff**; a proposal usually lives in the conversation, not on
disk, so a diff-based review would miss it (and may review unrelated
working-tree files instead).

## Workflow

1. **Create the run directory.** One directory per run, so concurrent runs
   never share a file. Use the printed path literally in every later step:
   shell variables do not survive between Bash calls.

   ```bash
   mkdir -p ~/.cache/agents-bridge/critique && mktemp -d ~/.cache/agents-bridge/critique/run.XXXXXX
   ```

2. **Capture the proposal — grounded.** Write to one file: the proposal
   verbatim, the problem it solves, any constraints, the questions you most want
   challenged, an explicit list of the **real repo file paths** it touches or
   depends on, and — if the user gave extra focus with the invocation — a final
   `## Extra focus from the user` section carrying it verbatim. Grounding in
   actual code is the one thing that makes the critique useful; skip it and the
   review drifts into generic advice. Everything user-authored goes in the file,
   never inline in the shell command (quotes/backticks break inline prompts).

   `Write <dir>/proposal.md`

3. **Run Codex read-only** (it is a review; it must not edit). The substance,
   including any user focus, is in the file; the inline prompt only carries the
   proposal-file path. Capture JSONL so the thread id can be read back for
   follow-ups:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/codex" exec \
     -s read-only \
     -c model_reasoning_effort=xhigh \
     --json -o <dir>/verdict.md \
     "You are giving a CRITICAL SECOND OPINION on a proposal made by another AI (Claude), at the user's request. Read <dir>/proposal.md in full — including any 'Extra focus from the user' section — then read the real repo files it lists before judging. Then: (1) briefly confirm what is sound; (2) challenge only what is genuinely weak — correctness bugs, wrong assumptions, missed edge cases, or a simpler/safer/more idiomatic option — grounding every point in the actual code; (3) where a better path exists, describe it concretely and explain WHY (tradeoffs); (4) if it is good as-is, say so plainly and do not invent problems. End with a one-line verdict: SHIP / ADJUST / RECONSIDER." \
     </dev/null > <dir>/critique.jsonl
   ```

   Copy that command as written, with the literal path: a shell variable or
   `$?` added to it prompts. Codex's verdict lands in `<dir>/verdict.md`
   (`-o` = final message); `<dir>/critique.jsonl` holds the event stream.

4. **Relay, then verify.** Surface Codex's verdict and reasoning. Then
   **independently check its claims** before acting — confirm a flagged bug is
   real, or push back if Codex is wrong. The value is two models reasoning in the
   open with Claude adjudicating, never Claude blindly deferring.

## Defaults & overrides

- Model: the codex config default (no `-m` is passed), effort `xhigh`, sandbox
  `read-only`. Override with codex flags (`-m <model>`,
  `-c model_reasoning_effort=<level>`) if the user asks. A critique is
  adversarial reasoning work — don't downgrade the tier.
- To push back, write the objection to `<dir>/pushback.md`, read the thread
  id from the JSONL (never scrape the header, never `resume --last`) and
  resume by explicit id. **Resume does not inherit the first run's flags** (it
  falls back to config defaults), so re-state sandbox and effort. The
  `allowed-tools` grant covers the invoking turn only, so a later turn prompts
  for these commands:

  ```bash
  jq -r 'select(.type=="thread.started") | .thread_id' <dir>/critique.jsonl
  "${CLAUDE_PLUGIN_ROOT}/scripts/codex" exec resume <thread id> \
    -c sandbox_mode=read-only \
    -c model_reasoning_effort=xhigh \
    --json -o <dir>/verdict.md \
    - < <dir>/pushback.md > <dir>/critique.jsonl
  ```
- With `--json` the run header is suppressed — the flags you pass are the only
  control.
