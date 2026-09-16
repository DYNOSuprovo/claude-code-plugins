# vellum

v1.1.0

Write a plan the way its reviewer reads it, then review it in the browser. The skill orders the plan by what the reviewer is most likely to change and buries the mechanics; the hooks module holds a planning mode of its own: `/vellum:start` enters it, Claude writes the plan and its mockups in a working directory, the reviewer comments them in a page or approves, and the answer reaches Claude as a prompt.

Replaces `plan-frontiers` and `software-craft:thorough-plan`.

## Requirements

- Claude Code with function hooks, launched with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` until they ship publicly. Without the flag the hooks module does not load: the skill still writes a plan under `plans/<date>/<slug>/`, but there is no mode, no page and no `mcp__vellum__submit` tool; use the native plan mode for that session.
- `bun` on the PATH: the review server is a Bun script. Claude Code installs the plugin's dependencies (`preact`, `remark`, `rehype-highlight`, `mermaid`) at its cache from `package.json` and `bun.lock`.
- A browser: Chromium or Firefox, recent. The page uses the CSS Custom Highlight API.
- Managed settings without an `allowedMcpServers` key. Where that key is set at all, empty included, Anthropic's `sec-default` refuses a user-tier `$.tool.register` by name: `mcp__vellum__submit` does not exist on that machine and the mode cannot be entered. The skill still writes a plan.

## Skill

`/vellum:start` triggers itself when a design choice is open, a change crosses several modules or interfaces, or a refactor reshapes a contract. Three moves:

1. Size the ceremony. A one-sentence diff gets no plan. A fuzzy idea gets a throwaway first, after the few questions that pin down what it must show.
2. Settle the open choices in question rounds, each question with a recommended answer. Only a question whose answer changes the architecture, an interface or the scope is asked; the rest becomes a recorded assumption. `assume` closes a round.
3. Write the plan to `plan.md`, ordered by probability of revision: decisions, interfaces, files, slices with their check, out of scope, then mechanics. Then call `mcp__vellum__submit`.

References, loaded one at a time: `program-design.md` (signatures, call-stack and file trees, command interfaces, contracts), `slices.md` (vertical order, sizing, implementation notes), `visual.md` (when a mockup or a diagram earns its place).

## Review in the browser

`/vellum:start` enters the mode. The hooks module creates `plans/<date>/wip-<sid8>/`, tells Claude to put the plan and its artifacts there, starts one review server per session on `127.0.0.1` (it exits on its own once the session's heartbeat stops) and opens the page. While the mode is live, `Edit`, `Write` and `NotebookEdit` under the project and outside the working directory are refused with a reason Claude reads; inside it they pass without a prompt; a path outside the project is no change to the codebase and follows the session's own permission flow, so the session's scratchpad passes there without a prompt; a lock that fails refuses the call rather than letting it past; every other tool follows the session's own permission flow, and a Bash command that a settings allow rule would approve asks instead. The native plan mode is untouched and stays available for a plan that needs no review page.

1. The page lists the working directory's renderable files from the start: Markdown, HTML in a sandboxed iframe, images. `[` and `]` move between documents; an artifact can sit beside the plan. A comment sent before the first version is written to `.review/v0.feedback-<n>.md` and reaches Claude as a prompt at its next idle: it revises the file and goes on.
2. Claude writes `plan.md` at the directory's root and calls `mcp__vellum__submit`: the text is saved as `.review/vN.md`, the page shows it, Claude ends its turn. The same text keeps its version; after a feedback, a submit is a new version.
3. Comments: select text in a Markdown document, or Pinpoint a block, a code block, a table cell or a diagram; in an HTML mockup, Pinpoint an element and Ctrl+click to add another. The box under the comments takes a general comment. Code blocks are coloured and Mermaid blocks are drawn.
4. **Send feedback** writes `.review/vN.feedback.md` (path, then lines and quote or selector and text, then the comment, for each) and submits a prompt: Claude reads the file, revises, calls `mcp__vellum__submit` again, `vN+1` in the same turn.
5. **Approve** renames the directory to the slug of the plan's title (`-2` on collision, `plan` without a title), rewrites the links in every text file of it, and submits a prompt naming the final directory. The mode closes and the lock lifts.

`/vellum:stop` leaves the mode without a plan; the directory is kept. `/clear`, and a `/resume` that lands in another session, suspend it: timers stopped, the session's record kept, so resuming that session later finds its directory. The status bar reads `vellum: planning`, then `vellum: plan vN under review`.

## Agent

`plan-reviewer` reads a plan and its artifacts, read-only, and reports Approved or Issues found with a verdict: overengineered, underengineered or right. The skill calls it for a large change or a plan no human will read; call it yourself with the plan path otherwise.

## Layout

```
hooks/register.ts     the mode's hooks (session.start, skill.prompt, tool.check, tool.call on submit)
hooks/host.ts         `Host`: one member per `$` call, the port the other files take
hooks/mode.ts         the machine: idle | live, and restore / connect / close
hooks/lock.ts         the write policy, pure
hooks/relay.ts        what the poll says to Claude, and what it remembers
hooks/server.ts       the review server's client: every route, the token header, the launcher
hooks/parse.ts        the boundary: unknown to types, and where the module's brands are minted
src/cli.ts            `start` spawns `serve` detached; `serve` is the review server
src/domain/           pure: paths, workspace states, decisions, the feedback text, slug, links
src/app/review.ts     the use case: read, decide, apply
src/adapters/         http (routes, the page bundled by Bun.serve from ui/index.html), fs, browser
ui/                   the Preact page: document list, decision bar, comments, text anchoring
plugins/              rendering plugins (markdown with highlight and Mermaid, html with its frame script, image); a third party sends a PR
types/claude-code.d.ts the function hooks contract, written by `/plugin-types vellum/types`
```

### What it hooks

| Hook | Matcher | What it does |
|---|---|---|
| `session.start` | | Registers the `submit` tool, and picks the mode back up when the stored server still answers. |
| `skill.prompt` | `skill=vellum:start` | Enters the mode: reaches or starts the server, then appends the working directory and the page's link to the skill's text. |
| `skill.prompt` | `skill=vellum:stop` | Leaves the mode and says which directory is kept. |
| `command.run` | `command=clear\|resume` | Suspends the mode after the command ran, when the session id changed: timers stopped, the record kept. |
| `tool.check` | | The lock. Its `.catch` denies whatever the failure, so a hook that throws or overruns cannot open it. |
| `tool.call` | `tool=mcp__vellum__submit` | Gates the plan and names the version, without running a tool. |

### What it calls on `$`

| Call | What for |
|---|---|
| `$.tool.register` | The `submit` tool, at the session's start. |
| `$.session.id` | Which session the mode belongs to; a `/clear` mints a new one. |
| `$.session.cwd` | Where the session runs now, to resolve a relative path the lock reads. |
| `$.store.get`, `$.store.set`, `$.store.delete` | The session's server and what the poll already relayed, so a module reload repeats neither. |
| `$.http.fetch` | Every call to the review server, with the token header. |
| `$.process.run` | Spawns the detached server, `bun src/cli.ts start`. |
| `$.clock.every` | The poll, once a second, and the heartbeat that keeps the server alive. |
| `$.prompt.submit` | Hands Claude a drafting batch, a feedback or the approval, once the session is idle. |
| `$.ui.status` | The line under the prompt: planning, then the version under review. |
| `$.ui.log` | Errors only: a server that did not start, a poll that failed, a prompt another plugin dropped. |

`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate vellum` prints both lists from the module's source; these tables are that output in prose.

Development: `bun install --cwd vellum`, `bun test vellum`, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate vellum`, then a session with `--plugin-dir vellum`; see `docs/plugin-testing.md` at the repository root. The map of the code and where it goes next: `docs/architecture.md` in this directory.

## Sources

Thariq Shihipar (Anthropic) on ordering a plan by what the reviewer will tweak and on artifacts passed to a fresh session; Dex Horthy (HumanLayer) on program design formats and vertical slices; the OpenAI Codex plan-mode prompt on assumptions and on what to omit; Boris Cherny on the overengineered / underengineered verdict; Jesse Vincent's superpowers on the plan reviewer; Plannotator for the review ideas, not the code. Collected September 2026.

## License

MIT

## Author

Augustin BENGOLEA <bengous@protonmail.com>
