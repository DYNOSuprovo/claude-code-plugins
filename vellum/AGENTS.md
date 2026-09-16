# Vellum

A Claude Code plugin: `/vellum:plan` enters a mode the hooks module holds, where Claude
writes `plan.md` and calls `mcp__vellum__submit`; the plan and its artifacts open in the
browser, and the reviewer's answer reaches Claude as a prompt. `/vellum:stop` leaves the mode.
Function hooks, early access: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

## Shape

Hexagonal with a functional core: two hexagons (the hooks module, the server) and a page.

```
hooks/                   the engine adapter: register.ts spells `$`, the rest takes a `Host`
skills/plan, skills/stop the way in and the way out
        │ HTTP, token header
src/adapters/            http/routes.ts, http/serve.ts, fs.ts, browser.ts: every IO
src/app/review.ts        the use case: read, decide, apply
src/domain/              pure, no IO: paths, workspace, review, feedback, slug, links
src/protocol.ts          what crosses HTTP and a plugin boundary; JSON
src/cli.ts               the entry point: `start` spawns `serve` detached
ui/                      the Preact page; plugins/<kind>/ one document kind, server half and UI half
```

Dependencies point toward `src/domain/`, held by `src/boundaries.spec.ts`. The rules of each
zone load with its files, from `.claude/rules/`: `hooks.md`, `server.md`, `page.md`,
`tests.md`. The drawings, the assessment and where the next phases land: `docs/architecture.md`.

## Commands

```bash
bun install --cwd vellum                                            # once; Claude Code does it at the plugin's cache
bun test vellum                                                     # the server's and the page's `*.spec.ts` suites
bun test vellum/src/domain/slug.spec.ts                             # one suite; `-t <pattern>` filters by test name
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test vellum       # the hooks module's `tests/*.test.ts`, through the engine's kit
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate vellum   # what the hooks module hooks and calls
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 command claude --permission-mode default --plugin-dir vellum   # a live session from source
bun vellum/src/cli.ts serve --session <id> --project <dir> --workdir plans/<date>/wip-<sid8>/      # the server alone, for page work; the trailing slash is required
claude -p --setting-sources project "/plugin-types vellum/types"    # regenerate types/claude-code.d.ts after a Claude Code update; keep claude-code.d.ts only
```

Every command runs from the repository root; lint, types and format are the repository's
gates, listed in its `AGENTS.md`. The server alone prints port and token and serves the page
at `http://127.0.0.1:<port>/t/<token>/`; it exits 90 s after its last `POST /api/heartbeat`.
Only the hooks module posts the heartbeat, the page does not: alone, post it in a loop with
the header `x-vellum-token: <token>`.

A live session, the browser, and the facts measured on Claude Code: `docs/plugin-testing.md`
at the repository root, § Testing a hooks module, and `plans/2026-09-15/plan-review-rewrite/`.

## Boundaries

- `types/claude-code.d.ts` is generated, never edited; `vellum/types/**` is ignored by the linters.
- `package.json` + `bun.lock` carry every runtime dependency; a new one goes through the ladder in the repository's `AGENTS.md` first.
