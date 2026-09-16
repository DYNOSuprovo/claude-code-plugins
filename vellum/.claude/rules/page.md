---
paths:
  - "ui/**"
  - "plugins/**"
---

# The page and its renderers

`ui/` is the Preact page: `api.ts` the client (token, routes, SSE), `state.ts` the store of
signals, `*.tsx` the components, `anchoring.ts` and `highlights.ts` the text selection.
`plugins/<kind>/` is one document kind: `server.ts` pure (candidates in, linked docs out) and
`ui.tsx` the renderer, registered in `plugins/server.ts` and `plugins/index.ts`. One bundle
is a browser's: `Bun.serve` builds it from `ui/index.html` at run time, no build step.

- `ui/` and `plugins/` never import `src/app` or `src/adapters`; they depend on
  `src/protocol.ts` only. `src/` never imports `ui/` beyond `index.html`. Held by
  `src/boundaries.test.ts`.
- Everything crossing `/api` is JSON and typed in `src/protocol.ts`; a new field lands there
  first.
- The page draws in every state, `drafting` included: `review.docs` is the working directory's
  renderable files, the plan at the head once there is one. Comments are taken while
  `inReview` and while `drafting`, so `locked` names two states, not one, and Approve is drawn
  only where a version exists.
- A new document kind is one folder with both halves and two registry lines, not a branch in
  an existing renderer.
- A kind folder may hold a helper beside `ui.tsx` (`markdown/pinpoint.ts`, `html/pick.ts`): its
  choice is a pure function tested with `bun test`, its DOM part a thin adapter. The page has no
  DOM implementation to test against.
- An HTML file is served with a sandboxed CSP, so the page cannot reach into it: `html/frame.ts`
  runs inside the mockup and owns the selection there, the page only sends it the method, the
  Ctrl state and the selectors already commented. `html/messages.ts` is the contract both sides
  import; every message crosses with the target `"*"` and each side checks `event.source`.
