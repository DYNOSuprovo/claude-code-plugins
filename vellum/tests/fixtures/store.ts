import type { On } from "claude-code";

/**
 * The plugin's own store, in memory and readable by the test: the kit's `$` has
 * no `store` noun, so `mock.store` would keep what the module wrote out of view.
 */
export function store(
  on: On,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the plugin store keeps whatever a plugin puts in it; `unknown` is the engine's own value type for it (`ResultOf['store.get']`).
  entries: Readonly<Record<string, unknown>> = {},
): Map<string, unknown> {
  const kept = new Map(Object.entries(entries));

  on("store.get", (_, e) => ({ value: kept.get(e.key) }));

  on("store.set", (_, e) => {
    kept.set(e.key, e.value);

    return { value: undefined };
  });

  on("store.delete", (_, e) => {
    kept.delete(e.key);

    return { value: undefined };
  });

  on("store.keys", () => ({ value: [...kept.keys()] }));

  return kept;
}
