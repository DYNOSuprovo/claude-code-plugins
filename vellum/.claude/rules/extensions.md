---
paths:
  - "src/extensions/**"
  - "src/core/extension.ts"
---

# Extensions

An extension is a folder, `src/extensions/<id>/`, with one file per place where it plugs into
the core: `page.tsx` declares a `PageExtension` (its renderers), `server.ts` a
`ServerExtension` (its `linkedDocs`). Both types live in `src/core/extension.ts`. `markdown`,
`html` and `image` are extensions like the next ones. A third half, `engine.ts`, lands with
`grill`, the first extension the hooks module calls; until then no extension touches
`src/core/engine/`.

- To add one: the folder, its halves, and one line per registry (`src/extensions/page.ts`,
  `src/extensions/server.ts`). A half is `export const <name>: PageExtension = { id: "<id>", … }`
  (or `ServerExtension`), and its `id` is the folder's name. Nothing else in `src/core/`
  changes; when something must, the core lacks a place to plug into, and that is the change
  to propose first.
- An extension imports `src/core/` and its own folder, never `../<another>/`. From
  `src/core/page/` it imports the files `PAGE_SURFACE` lists in `src/boundaries.spec.ts`: one
  more is a decision to take, not a convenience.
- A helper and its `*.spec.ts` live in the folder, beside the half that uses them.
- An option or a flag exists when someone asked to turn it, never in advance. Config files,
  manifests and `enabled` land with `grill`; their design is `docs/architecture.md`
  § Extensions.
- `src/boundaries.spec.ts` fails, naming the file, when any of this is broken. An import it
  refuses is in the wrong place, not a rule to loosen.
