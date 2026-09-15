# Architecture

## Shape

Hexagonal with a functional core: two hexagons (the hooks module, the server) and a page.
The domain is pure functions over immutable data; one application module orchestrates;
the adapters are plain modules, no interface, no injection.

```
hooks/register.ts        the engine adapter: one file, types from `claude-code` only, one State union, `$` is its port
        │ HTTP, token header
src/adapters/http/       routes.ts parses bodies and paths and answers status codes; serve.ts binds and bundles the page
src/adapters/fs.ts       every read and write under the project root: listing, versions, feedback, rename and rewrite
src/adapters/browser.ts  opens the page
src/app/review.ts        the use case: reads through the adapter, calls the domain, applies files, memory, listeners
src/domain/              pure, no IO: paths (brands, parsers), workspace (states, memory, pending), review (decisions),
                         feedback (anchors, the text Claude reads), slug, links
src/protocol.ts          what crosses HTTP and a plugin boundary; JSON; re-exports the domain types it carries
src/cli.ts               the entry point: `start` spawns `serve` detached
ui/api.ts, ui/state.ts   the page's client and its store; ui/*.tsx the components; anchoring and highlights
plugins/<kind>/          one document kind: server.ts (pure, candidates in) and ui.tsx (the renderer)
plugins/index.ts, plugins/server.ts   the two registries: one bundle is a browser's
```

Dependencies point toward `src/domain/`, held by `src/boundaries.test.ts`: `domain/` imports
no `node:*`, `bun`, adapter, app or page; `hooks/register.ts` imports `claude-code` only;
`ui/` and `plugins/` never import `src/app` or `src/adapters`; `src/` never imports `ui/`
beyond `index.html`.

## Rules

- **State is one union, never several nullables.** The hooks module holds one `State`
  (`idle | drafting | reviewing | approved`); the server derives what is pending from the
  workspace (`domain/workspace.ts`, `pendingOf`) instead of keeping a second variable. A new feature adds a
  variant, not a flag. Before writing `let x: T | null`, name the state `null` stands for.
- **Decide, then apply.** Read everything first, take the decision as a pure function of
  plain values in `src/domain/`, then write files, timers and prompts through `src/adapters/`. The pure part is
  tested with plain calls; the applying part with a temp directory or the fake `$`.
- **Parse at the boundary, once, into a branded type.** `parseWipDir`, `parseVersion`,
  `parseProjectPath` grant `WipDir`, `Version`, `ProjectPath`; the hooks module's parsers
  read `tool_input`, `$.store` values and the server's JSON. Past the parser: no `typeof`,
  no `as`, no re-check. A `ParseResult` is returned where the caller decides; anything else
  throws, and the route or the hook turns it into an answer.
- **Fakes at the ports, nothing else faked.** The engine's `$` is the hooks module's one
  port: tests answer it from memory (`hooks/register.test.ts`). The server's port is the
  file system: tests use a temp directory. No module mocking, no spy on an internal call.
- **A test is one behaviour under fifteen lines, data in view.** Helpers hide the plumbing;
  the version, the path, the text the case turns on stay in the test. Before the code of a
  slice, its tests are listed one line each and agreed, written first, seen failing for the
  right reason.

## Not adopted

- File and function length thresholds: the pedantic oxlint and the anti-slop pack are the mechanical backstop.
- Ports as interfaces with a fake each: `adapters/fs.ts` has one implementation and the file system is fast; the port is extracted the day a second one exists.
- A contract test between the fake `$` and the engine: `claude plugin test` cannot raise `classic.*` events.
