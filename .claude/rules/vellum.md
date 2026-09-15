---
paths:
  - "vellum/**"
---

# Vellum: the shape of its code

Five rules, each paid for by a bug the first review found (PR #104, 15 findings, four of
them an implicit state). Distilled from Johan Martinsson's craft rules; the examples are
this plugin's.

- **State is one union, never several nullables.** The hooks module holds one `State`
  (`idle | drafting | reviewing | approved`); the server's `Review` derives what is pending
  from the workspace instead of keeping a second variable. A new phase adds a variant, not a
  flag. Before writing `let x: T | null`, ask which state `null` stands for and name it.
- **Decide, then apply.** Read everything first, take the decision as a pure function of
  plain values (`src/server/transitions.ts`), then write files, timers and prompts. The pure
  part is tested with plain calls; the applying part with a temp directory or the fake `$`.
- **Parse at the boundary, once, into a branded type.** `parseWipDir`, `parseVersion`,
  `parseProjectPath` grant `WipDir`, `Version`, `ProjectPath`; the hooks module's parsers
  read `tool_input`, `$.store` values and the server's JSON. Past the parser, no `typeof`,
  no `as`, no re-check. A `ParseResult` is returned where the caller decides; anything
  else throws and the route or the hook turns it into an answer.
- **Fakes at the ports, nothing else faked.** The engine's `$` is the one port of the hooks
  module: tests answer it from memory (`hooks/register.test.ts`). The server's port is the
  file system: tests use a temp directory. No module mocking, no spy on an internal call.
- **A test is one behaviour under fifteen lines, data in view.** Setup and assertion
  helpers hide the plumbing; the version, the path, the text the case turns on stay in the
  test. Before the code of a slice, its tests are listed one line each and agreed; they are
  written first and seen failing for the right reason.

Not adopted, on purpose: the file and function length thresholds (the pedantic oxlint and
the anti-slop pack are the mechanical backstop here), the controller / use case / port
layering (`routes.ts` → `Review` → pure modules is that shape already), and a contract test
between the fake `$` and the engine (`claude plugin test` cannot raise `classic.*` events).
