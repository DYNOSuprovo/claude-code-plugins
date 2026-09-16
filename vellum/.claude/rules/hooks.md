---
paths:
  - "hooks/**"
---

# The hooks module

`hooks/register.ts` is the engine adapter: one file, types from `claude-code` only, nothing
from `src/`; `$` is its one port. Held by `src/boundaries.test.ts`.

The module holds the vellum mode, a mode of its own: the native plan mode never enters the
loop. `/vellum:plan` enters it, Approve in the page or `/vellum:stop` leaves it.

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
  `unknown` and are parsed in the block marked as the boundary parser. Past it: no `typeof`,
  no `as`, no re-check.
- Saving the file under `--plugin-dir` reloads the module in a fresh environment and every
  pending timer dies: state that must survive a reload goes to `$.store`.
- A hook answers within its dispatch's budget, about ten seconds. What waits for a person is
  polled by `$.clock.every` and handed to the session by `$.prompt.submit`, which runs once
  the session is idle.
- Tests answer `$` from memory (`register.test.ts`): `bun test` cannot host the engine's
  environment. Nothing else is faked.
