import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { serverPlugins } from "../../../plugins/server.ts";
import index from "../../../ui/index.html";
import { Review } from "../../app/review.ts";
import type { WipDir } from "../../domain/paths.ts";
import { REVIEW_DIR } from "../../domain/workspace.ts";
import { openInBrowser } from "../browser.ts";
import { watchFiles } from "../fs.ts";
import { createHandler } from "./routes.ts";

export type ServeOptions = {
  readonly project: string;
  readonly workdir: WipDir;
  readonly port: number;
};

export type Started = {
  readonly server: Bun.Server<undefined>;
  readonly token: string;
  readonly url: string;
  /** Stops the server and its watchdog; for tests, which share one process. */
  readonly stop: () => void;
};

export const HEARTBEAT_GRACE_MS = 90_000;

const WATCHDOG_PERIOD_MS = 5_000;

/**
 * `plugins/html/frame.ts` for the sandboxed mockups, built once: the page bundle never loads it.
 * An IIFE, since a classic `<script>` shares the mockup's global scope: the default ESM output
 * has no wrapper, and its minified names would collide with the mockup's own (`_`, `a`, `r`).
 */
async function buildFrameScript(): Promise<string> {
  const entry = join(import.meta.dir, "../../../plugins/html/frame.ts");
  const built = await Bun.build({ entrypoints: [entry], minify: true, format: "iife" });
  const output = built.outputs[0];

  if (output === undefined) throw new Error(`no output building ${entry}`);

  return await output.text();
}

export async function startServer(options: ServeOptions): Promise<Started> {
  await mkdir(join(options.project, options.workdir, REVIEW_DIR), { recursive: true });
  const token = crypto.randomUUID();
  const frameScript = await buildFrameScript();

  const review = new Review({
    project: options.project,
    workdir: options.workdir,
    plugins: serverPlugins,
  });

  // The page hears of every file Claude writes; the approval renames the directory, and there the watch ends.
  const unwatch = watchFiles(options.project, options.workdir, () => void review.notify());

  review.subscribe((workspace) => {
    if (workspace.kind === "approved") unwatch();
  });

  let lastHeartbeat = Date.now();
  let url = "";

  const handler = createHandler({
    token,
    project: options.project,
    review,
    frameScript,
    openBrowser: () => openInBrowser(url),
    heartbeat: () => {
      lastHeartbeat = Date.now();
    },
  });

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port,
    idleTimeout: 0,
    development: false,
    routes: { [`/t/${token}/`]: index },
    fetch: handler,
  });

  url = `http://127.0.0.1:${server.port}/t/${token}/`;

  const watchdog = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_GRACE_MS) process.exit(0);
  }, WATCHDOG_PERIOD_MS);

  return {
    server,
    token,
    url,
    stop: () => {
      unwatch();
      clearInterval(watchdog);
      server.stop(true);
    },
  };
}
