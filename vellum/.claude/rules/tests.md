---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
---

# Tests

- Two suffixes, two runners: `*.spec.ts` for the server's and the page's `bun:test` suites,
  `*.test.ts` under `tests/` for the hooks module's kit tests. `claude plugin test` collects
  every `*.test.ts` under the plugin root and loads the module from `<root>/hooks/` only, so
  a `bun:test` suite named `*.test.ts` anywhere in the plugin fails its run.
- One behaviour per test, under fifteen lines, data in view: helpers hide the plumbing; the
  version, the path, the text the case turns on stay in the test.
- Before the code of a slice, its tests are listed one line each and agreed, written first,
  seen failing for the right reason.
- Fakes at the ports, nothing else faked: the engine's `$` answered from memory in
  `hooks/register.test.ts`; the server's file system is a temp directory through the real
  adapter; `adapters/http` starts the server on port 0. No module mocking, no spy on an
  internal call.
- `src/boundaries.spec.ts` holds the dependency direction; an import that fails it is in the
  wrong layer, not a test to loosen.
