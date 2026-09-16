import type {
  HttpInit,
  HttpResponse,
  ProcessRunInit,
  ProcessRunResult,
  PromptSubmitResult,
  TimerCall,
} from "claude-code";

/**
 * The engine as a hook bound it from its `$`, each member spelled `$.noun.event(...)` there.
 *
 * The loader follows `$` only into a function declared in the file that registers the hook,
 * so every other file of the module takes this instead: "$ is followed only into a function
 * declared in this same file, never across an import; $ is always spelled $.noun.event(...)
 * at the call site".
 */
export type Host = {
  /** `$.session.id`. */
  sessionId: () => Promise<string>;

  /** `$.session.cwd`: where the session runs now, which every `cd` moves. */
  cwd: () => Promise<string>;

  /** `$.plugin.root`: the plugin's directory, read when the host is bound. */
  readonly pluginRoot: string;

  /** `$.store.get`. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the plugin store keeps whatever a plugin put in it; `unknown` is the engine's own result type (`ResultOf['store.get']`), and `parse.ts` is what reads it.
  storeGet: (key: string) => Promise<unknown>;

  /** `$.store.set`. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the store takes any JSON value, as `$.store.set` does; the module's own records are typed where they are built.
  storeSet: (key: string, value: unknown) => Promise<void>;

  /** `$.store.delete`. */
  storeDelete: (key: string) => Promise<void>;

  /** `$.http.fetch`. */
  fetch: (url: string, init?: HttpInit) => Promise<HttpResponse>;

  /** `$.process.run`. */
  run: (argv: readonly string[], init: ProcessRunInit) => Promise<ProcessRunResult>;

  /** `$.clock.every`. */
  every: TimerCall;

  /** `$.prompt.submit`: hands the session a prompt once it is idle. */
  submitPrompt: (text: string) => Promise<PromptSubmitResult>;

  /** `$.ui.status`: the plugin's line under the prompt. */
  status: (text: string | undefined) => void;

  /** `$.ui.log`: one debug line under the plugin's name. */
  log: (text: string) => void;
};
