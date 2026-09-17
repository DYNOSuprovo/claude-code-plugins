---
paths:
  - "src/**"
---

# The server

Hexagonal with a functional core. `src/domain/` is pure functions over immutable data: no
`node:*`, no `bun`, no adapter, app or page import. `src/app/review.ts` is the one use case:
read through the adapter, decide in the domain, apply files, memory and listeners.
`src/adapters/` are plain modules, no interface, no injection: `fs.ts` every read and write
under the project root, `http/routes.ts` bodies, paths and status codes, `http/serve.ts`
binding and the page bundle, `browser.ts` the opener. Direction held by `boundaries.spec.ts`.

- Decide, then apply. Read everything first, take the decision as a pure function of plain
  values in `domain/`, then write files, timers and prompts through `adapters/`.
- State is derived, never stored twice: what is pending comes from the workspace
  (`domain/workspace.ts`, `pendingOf`), not from a second variable. A new feature adds a
  variant to a union, not a flag.
- Parse at the boundary, once, into a branded type: `parseWipDir`, `parseVersion`,
  `parseProjectPath` grant `WipDir`, `Version`, `ProjectPath`. Past the parser: no `typeof`,
  no `as`, no re-check. A `ParseResult` is returned where the caller decides; anything else
  throws, and the route turns it into an answer.
- `protocol.ts` is the one place a value crossing HTTP or a plugin boundary is typed; it
  re-exports the domain types it carries, never redefines them.
- A new domain concept gets its address in `domain/` before its first line.
- A version is a text somebody handed over for review, Claude through `gate` or the reviewer
  through a decision that carries an `Edit`. `decideOn` decides all of it, purely: the version
  the decision applies to, the version file to write, the comments retargeted to it, the notes
  file. An `Edit` names the version it edits, and one of another version is refused: a bare text
  sent after Claude recorded `vN+1` would overwrite that revision and tell Claude to keep it.
  `vN.md` stays what its author submitted.
- `Review.decide` applies in an order where a write that fails leaves a state the next `gate`
  or the next load repairs: `plan.md` before the edit's version file, the notes file and the
  draft's removal before the rename, which carries what is there. A `null` from `formatNotes`
  writes nothing and keeps a notes file already there: a retry after a failed rename carries no
  note. Whether the approval's prompt names a notes file is read from the final directory's
  listing, never from the decision.
- The draft is the page's, stored and never read back: `PUT /api/draft` parses it as it parses a
  decision's annotations and edit, `GET` returns the bytes. `saveDraft` writes one with content
  only where `takesComments` holds and answers 409 elsewhere, since a write would recreate a
  directory the approval has just renamed; an empty one removes the file in any state. A draft
  write raises no workspace event: `watchFiles` leaves `.review/` to the server.
