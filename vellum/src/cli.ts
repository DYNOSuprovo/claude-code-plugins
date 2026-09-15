#!/usr/bin/env bun

import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    session: { type: "string" },
    project: { type: "string" },
    workdir: { type: "string" },
    port: { type: "string" },
  },
});

const [command] = positionals;

const { session, project, workdir } = values;

if (session === undefined || project === undefined || workdir === undefined) {
  console.error(
    "usage: cli.ts start|serve --session <id> --project <dir> --workdir <dir> [--port <n>]",
  );
  process.exit(2);
}

const HEARTBEAT_GRACE_MS = 90_000;

if (command === "serve") {
  const token = crypto.randomUUID();
  let lastHeartbeat = Date.now();

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(values.port ?? 0),
    idleTimeout: 0,
    fetch(request) {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        if (request.headers.get("x-vellum-token") !== token) {
          return new Response("unauthorized", { status: 401 });
        }

        if (url.pathname === "/api/heartbeat") {
          lastHeartbeat = Date.now();

          return new Response(null, { status: 204 });
        }

        if (url.pathname === "/api/review") {
          return Response.json({ workspace: { kind: "drafting", dir: workdir }, session });
        }
      }

      return new Response("not found", { status: 404 });
    },
  });

  setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_GRACE_MS) process.exit(0);
  }, 5_000);

  console.log(JSON.stringify({ port: server.port, token, pid: process.pid }));
} else if (command === "start") {
  const child = Bun.spawn(["bun", import.meta.path, "serve", ...process.argv.slice(3)], {
    stdio: ["ignore", "pipe", "ignore"],
    detached: true,
  });

  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (!buffered.includes("\n")) {
    const { value, done } = await reader.read();

    if (done) {
      console.error("vellum serve exited before announcing its port");
      process.exit(1);
    }

    buffered += decoder.decode(value);
  }

  reader.releaseLock();
  child.unref();
  console.log(buffered.slice(0, buffered.indexOf("\n")));
  process.exit(0);
} else {
  console.error(`unknown command: ${command ?? "(none)"}`);
  process.exit(2);
}
