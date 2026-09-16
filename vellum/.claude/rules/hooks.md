---
paths:
  - "hooks/**"
---

# The hooks module

Seven files, each importing `claude-code`, a sibling `./<name>.ts`, or `import type` from
`../src/protocol.ts`, and nothing else. Held by `src/boundaries.spec.ts`.

```
register.ts  the engine adapter: the one `let state`, one hook per event, and `hostOf`
host.ts      `Host`, the port: one member per `$` call, named for the call
mode.ts      the machine: State, Session, Live, and restore / connect / close
lock.ts      the policy: lockVerdict, checkVerdict; pure
relay.ts     what the poll says and what it remembers: prompts, Relayed, tick
server.ts    the review server's client: every route, the token header, the launcher
parse.ts     the boundary: unknown to types, and the only place a brand is minted
```

The module holds the vellum mode, a mode of its own: the native plan mode never enters the
loop. `/vellum:plan` enters it, Approve in the page or `/vellum:stop` leaves it.

- `$` is spelled only in `register.ts`, and the other files take a `Host`. The loader
  refuses anything else: "$ is followed only into a function declared in this same file,
  never across an import; $ is always spelled $.noun.event(...) at the call site". Passing one
  noun is refused the same way ("$.store is used as a value"). `hostOf($)` is built inside
  each hook, so a timer keeps the host of the dispatch that started it.
- One `State` union (`idle | live`), never several nullables. A new feature adds a variant,
  not a flag. Before writing `let x: T | null`, name the state `null` stands for.
- `session.start` registers the tool `submit` (`mcp__vellum__submit`, the model's "the plan
  is written" signal), served by a `tool.call` hook that answers without `next`. Its matcher
  must be a string literal, or `claude plugin validate` prints the expression instead of the
  name.
- The way out is the skill `vellum:stop`, closed on its own `skill.prompt` hook, not
  `$.command.register`: a registered command takes the global namespace (`/stop`), and
  `disable-model-invocation` keeps this one the reviewer's to run. The hook appends its line
  to `next(e).text`, as the plan skill appends the working directory.
- The lock is a `tool.check` hook with no matcher: while `live`, `Edit`, `Write` and
  `NotebookEdit` under the working directory are allowed outright, whatever the session's
  permission mode, and outside it are denied with the reason the model reads; every other
  tool passes on. `lockVerdict` decides as a pure function, the hook applies.
- Every transition is an engine event or an answer from the server, never a reflex of the
  model. What is under review lives on the server's disk; the module keeps no copy of it.
- Parse at the boundary, once: `tool_input`, `$.store` values and the server's JSON arrive as
  `unknown` and are parsed in `parse.ts`. Past it: no `typeof`, no `as`, no re-check. The
  brands (`SessionId`, `Token`, `ProjectDir`, `Workdir`) are minted there and nowhere else.
- The server's JSON is typed from the server's own types: `parse.ts` imports `Pending` and
  `GateAnswer` from `../src/protocol.ts` as types, and `Json<T>` strips the domain's brands,
  which the module reads but never grants. A field the server adds or renames fails `tsgo` in
  the parser.
- Saving the file under `--plugin-dir` reloads the module in a fresh environment and every
  pending timer dies: state that must survive a reload goes to `$.store`.
- A hook answers within its dispatch's budget, about ten seconds. What waits for a person is
  polled by `$.clock.every` and handed to the session by `$.prompt.submit`, which runs once
  the session is idle.
- One poll relays everything the reviewer sends: the drafting batches, then the decision. What
  was already named (the drafting count, the feedback version) goes to `$.store` under the
  working directory it belongs to, so nothing is said twice across a reload or a restarted
  server, and an approval drops the record: the next plan's batches count from one again.
- Tests run under the engine's own `$` (`claude plugin test vellum`, files in `tests/`):
  `bun test` cannot host that environment. The world beneath the module is answered by the
  kit's `mock.clock` and the `on(...)` hooks of `tests/fixtures/`. Nothing else is faked.
