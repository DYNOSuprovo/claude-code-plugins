# GitHub Flow Plugin

GitHub lifecycle for Claude Code through `gh`: agent-ready issues, review-ready PRs, issue and PR triage, CI-gated merge.

## Skills

| Skill | Invocation | What it does |
|-------|------------|--------------|
| `issue` | `/github-flow:issue [--dry-run] [number] <request>` | Writes or rewrites an issue as a prompt for another agent: Problem, Evidence, Hints, Done when, Out of scope. |
| `pr` | `/github-flow:pr [--dry-run] [image.png#alt ...] [notes]` | Pushes the branch and opens or updates its PR with a body sized to the diff; images go up through `gh --attach`. |
| `triage` | `/github-flow:triage [--dry-run] [number\|url]` | Verifies an issue or PR against the current code, gives a one-word verdict with proof, then closes or comments as the verdict fixes; valid work is reported, not implemented. Manual. |
| `await-merge` | `/github-flow:await-merge [--dry-run] [--rebase] [pr]` | Watches the checks, merges by squash (`--rebase` for atomic commits, never a merge commit), fast-forwards the local base branch. |
| `commit-push-pr` | `/github-flow:commit-push-pr [issue] [images] [notes]` | Chains `git:commit` then `github-flow:pr`. |
| `stacked-prs` | `/github-flow:stacked-prs [subcommand \| symptom]` | Runs a stack of PRs with `gh stack`: the cycle, the rules the CLI does not enforce, the repair table, and a worktree per layer cut from the top of the stack with its handoff symlinked in. |
| `dispatch` | `/github-flow:dispatch <n> [<n>...] [--plan\|--no-plan] [--approve]` | Gates each issue on readiness, then spawns one `issue-worker` per issue; labels the outcome, reports a table. |
| `shift` | `/github-flow:shift [--max <n>] [--dry-run]` | One pass of the loop: triage, dispatch, maintain the loop's PRs, return a digest. |

`issue`, `pr` and `stacked-prs` invoke themselves when the request matches. `triage`, `await-merge` and `commit-push-pr` run only on an explicit call: each one closes, merges or pushes, and "check issue 12" must not close issue 12. `dispatch` and `shift` stay model-invocable because a scheduled fire runs no other kind, and neither one merges or pushes a shared branch; `shift` closes an issue only through the `triage` protocol it applies itself.

No skill asks before it publishes, closes or merges: an orchestrating agent has nobody to answer. `--dry-run` does the whole job and prints what would be sent instead of sending it; rerun without it to send.

`github-flow` depends on the `git` plugin, installed with it.

### PR shape

The body is a review brief for another agent. Its sections grow with the diff:

| Size | Threshold | Sections |
|---|---|---|
| standard | otherwise | Why, What, Ask, Checks, Left open |
| large | ≥ 10 files, ≥ 300 lines, or a shared module | Why, Files that matter, The code that matters, Ask, Checks, Left open |

`Closes #N.` opens the body when the branch or a commit names an issue. A visual change carries a Before/After pair in Why: the agent captures both states with the session's browser tool when none is given, and `gh pr create --attach './before.png#alt'` uploads them; the alt text names what the reader sees. Ask tells the reviewer what to decide and what the author could not run. Checks list what ran with its numbers, never a check that did not run.

### Issue shape

```markdown
## Problem      what is observed and what is wanted, no solution
## Evidence     one fact per bullet, each anchored: path:line + symbol, or a commit
## Hints        where to start, traps, boundaries; suggestions, never a plan
## Done when    observable checkboxes, including the project's validation command
## Out of scope what not to touch on the way (omitted when empty)
```

The reader is a different agent in a fresh session. The issue proves the problem; the reader plans.

### Triage verdicts

| Issue | PR |
|---|---|
| `valid`, `fixed`, `outdated`, `duplicate`, `unclear` | `mergeable`, `needs-rebase`, `superseded`, `stale`, `unclear` |

Close comments are one to three sentences of fact: what was verified and the commit, issue, or PR that settles it.

### Stacked PRs

`stacked-prs` documents `gh stack` (the `github/gh-stack` extension): one PR per layer, each based on the layer below, landed atomically bottom to top. It carries the rules the CLI leaves to the caller (branch from the top, one checkout per session, verify content after every rebase, nothing on the trunk before landing) and a repair table keyed by symptom. `scripts/worktree-handoff.ts <branch> --base origin/<top>` cuts a worktree for a parallel session: it symlinks the gitignored orchestration folder (`.gh/` by default) so the session finds its handoff and its checklist writes come back to the main checkout, adds the folder to `info/exclude`, and installs dependencies from the lockfile. The handoff template lives in `skills/stacked-prs/assets/`.

## The loop

`shift` runs one pass of an issue-to-PR loop with no human inside it. It triages the open issues, hands the ready ones to `dispatch`, and keeps the pull requests the loop already opened green. The human reads the digest and merges; nothing in the loop merges.

`dispatch` spawns one `issue-worker` per issue, all in the same message. The agent (`github-flow:issue-worker`, `model: opus`, `isolation: worktree`) gets its own copy of the repository, implements, verifies itself under a 2-round red-green bound, then runs `git:commit` and `github-flow:pr`. Only a PR URL counts as done; anything else is `blocked`, reported with the failing output verbatim. In `fix <pr>` mode the same agent repairs a PR the loop owns.

State lives on GitHub, in labels, so a pass is idempotent:

| Label | On | Meaning |
|---|---|---|
| `needs-info` | issue | The readiness gate found no evidence or no acceptance criteria. |
| `dispatched` | issue | A worker opened its PR. |
| `blocked` | issue | A worker stopped; the failing output is a comment. |
| `shift` | PR | The loop owns this PR and maintains it. |
| `needs-human` | PR | Two fix rounds were not enough. The loop stops touching it. |

Three runners, one skill:

```bash
/loop /github-flow:shift
claude -p "/github-flow:shift" --permission-mode auto --max-turns 200 --max-budget-usd 5 --output-format json
/schedule /github-flow:shift
```

`/loop` re-runs the skill each iteration, in an open session, on a 1-minute-to-1-hour interval. The `-p` form suits a systemd timer: in `auto` mode a blocked action does not run and the pass continues, `--max-budget-usd` counts the workers' spend too, and both caps are print-mode only. `/schedule` puts the same prompt on the cloud, minimum interval 1 hour.

## Plans on pull requests

Two hooks carry the plan of a branch to the pull request that lands it, so the plan is read where the diff is reviewed instead of in a file nobody opens.

| Hook | Event | What it does |
|---|---|---|
| `scripts/capture-plan.ts` | `PreToolUse` on `ExitPlanMode` | Writes the plan to `~/.claude/plans/by-branch/<repo>/<branch>.md`, then refreshes the comment when the branch already has a PR. |
| `scripts/attach-plan.ts` | `PostToolUse` on `Bash` | On a `gh pr create` whose output carries a `/pull/<n>` URL, posts that branch's plan on the new PR. |

`<repo>` is the basename of the main checkout (`git rev-parse --path-format=absolute --git-common-dir`), so a worktree writes under the same key as the checkout it was cut from; `<branch>` is `git branch --show-current`, and a branch with slashes nests into directories. Outside a repository, or with no branch, the hook does nothing. The `issue-worker` agent writes that same path for the plan it receives, which is how a worker's PR carries its plan.

The comment opens with the marker `<!-- plan -->`, followed by a `<details><summary>Plan</summary>` block. A new plan on the same branch edits that comment instead of adding one: the hook lists the PR's comments and matches the first of yours whose body starts with the marker. One PR, one plan comment, whatever the number of revisions.

`PreToolUse`, not `PostToolUse`: the plan dialog's "Yes, clear context" options ([`showClearContextOnPlanAccept`](https://code.claude.com/docs/en/settings-reference#showclearcontextonplanaccept)) resolve the `ExitPlanMode` call as a denial, and `PostToolUse` runs only after a tool succeeds, so a plan approved that way would never be captured. The trade is that the plan is written before the answer: a rejected plan leaves its file behind until the next approval on that branch overwrites it, and on a branch that already has a PR, it reaches the comment.

Neither hook blocks. Both exit 0 on every path and report a failure on stderr, which `claude --debug` shows.

## Requirements

- GitHub CLI (`gh`) authenticated
- The `gh stack` extension (`gh extension install github/gh-stack`), for `stacked-prs` only
- The `git` plugin, for `commit-push-pr` only

## License

MIT

## Author

Augustin BENGOLEA (bengous@protonmail.com)
