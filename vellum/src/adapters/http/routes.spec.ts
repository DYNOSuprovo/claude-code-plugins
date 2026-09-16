import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serverPlugins } from "../../../plugins/server.ts";
import { Review } from "../../app/review.ts";
import type { WipDir } from "../../domain/paths.ts";
import { parseWipDir } from "../../domain/paths.ts";
import { createHandler, TOKEN_HEADER } from "./routes.ts";
import { startServer } from "./serve.ts";
import type { Started } from "./serve.ts";

const WIP = "plans/2026-09-15/wip-4c2a9d93/";

let started: Started;

let root: string;

function headers(): HeadersInit {
  return { "x-vellum-token": started.token, "content-type": "application/json" };
}

function url(path: string): string {
  return `http://127.0.0.1:${started.server.port}${path}`;
}

function post(path: string, body: string | null = null): Promise<Response> {
  return fetch(url(path), { method: "POST", headers: headers(), body });
}

function wipDir(): WipDir {
  const parsed = parseWipDir(WIP);

  if (!parsed.ok) throw new Error(parsed.error);

  return parsed.value;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "vellum-routes-"));
  mkdirSync(join(root, WIP), { recursive: true });
  writeFileSync(join(root, WIP, "mockup.html"), "<p>mock</p>");
  writeFileSync(join(root, WIP, "page.html"), "<body><p>hi</p></body>\n");
  writeFileSync(join(root, WIP, "notes.md"), "# notes\n");
  symlinkSync("/etc/hostname", join(root, WIP, "escape.txt"));
  const workdir = parseWipDir(WIP);

  if (!workdir.ok) throw new Error(workdir.error);
  started = await startServer({ project: root, workdir: workdir.value, port: 0 });
});

afterAll(() => {
  started.stop();
});

describe("routes", () => {
  test("the page is served bundled at /t/<token>/", async () => {
    const response = await fetch(url(`/t/${started.token}/`));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Vellum</title>");
    expect(html).toMatch(/<script[^>]+src="[^"]+\.js"/u);
  });

  test("/api needs the token", async () => {
    expect((await fetch(url("/api/review"))).status).toBe(401);
    expect((await fetch(url("/api/review"), { headers: headers() })).status).toBe(200);
  });

  test("files come with a sandbox CSP; escapes get 403 or vanish in URL parsing", async () => {
    const ok = await fetch(url(`/t/${started.token}/files/${WIP}mockup.html`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-security-policy")).toBe("sandbox allow-scripts");

    const dots = await fetch(url(`/t/${started.token}/files/%2e%2e/%2e%2e/etc/passwd`));
    expect([403, 404]).toContain(dots.status);
    expect(await dots.text()).not.toContain("root:");

    const symlink = await fetch(url(`/t/${started.token}/files/${WIP}escape.txt`));
    expect(symlink.status).toBe(403);

    const missing = await fetch(url(`/t/${started.token}/files/${WIP}nope.html`));
    expect(missing.status).toBe(404);
  });

  test("an html file carries the frame script, a markdown file is untouched", async () => {
    const tag = `<script src="/t/${started.token}/frame.js"></script>`;

    const framed = await fetch(url(`/t/${started.token}/files/${WIP}page.html`));
    expect(await framed.text()).toBe(`<body><p>hi</p>${tag}</body>\n`);

    const noBody = await fetch(url(`/t/${started.token}/files/${WIP}mockup.html`));
    expect(await noBody.text()).toBe(`<p>mock</p>${tag}`);

    const markdown = await fetch(url(`/t/${started.token}/files/${WIP}notes.md`));
    expect(await markdown.text()).toBe("# notes\n");
  });

  test("the frame script is served as JavaScript in its own scope, and only under the token", async () => {
    const script = await fetch(url(`/t/${started.token}/frame.js`));
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toStartWith("text/javascript");
    const text = await script.text();
    expect(text).toContain("vellum:pick");
    expect(text).toStartWith("(()=>{");

    expect((await fetch(url("/t/wrong-token/frame.js"))).status).toBe(404);
  });

  test("a file written under the working directory reaches the event stream", async () => {
    const events = await fetch(url(`/t/${started.token}/events`));
    const reader = events.body?.getReader();

    if (reader === undefined) throw new Error("no event stream");
    const next = async (): Promise<string> => new TextDecoder().decode((await reader.read()).value);
    expect(await next()).toContain('"type":"workspace"');
    writeFileSync(join(root, WIP, "late.md"), "# late\n");
    expect(await next()).toContain('"type":"workspace"');
    await reader.cancel();
  });

  test("gate answers 409 until plan.md exists, then the version", async () => {
    const missing = await post("/api/gate");
    expect(missing.status).toBe(409);
    expect(await missing.json()).toEqual({ error: `write plan.md in ${WIP} first` });

    writeFileSync(join(root, WIP, "plan.md"), "# Routed plan\n");
    expect(await (await post("/api/gate")).json()).toEqual({ version: 1, kept: false });
    expect(await (await post("/api/gate")).json()).toEqual({ version: 1, kept: true });
  });

  test("gate reads how an unchanged plan.md is treated from its body", async () => {
    const kept = await post("/api/gate", JSON.stringify({ unchanged: "keep" }));
    expect(await kept.json()).toEqual({ version: 1, kept: true });
  });

  test("the finalize route is gone", async () => {
    expect((await post("/api/finalize", JSON.stringify({ version: 1 }))).status).toBe(404);
  });

  test("open reaches the browser only while no tab listens", async () => {
    let opened = 0;
    const review = new Review({ project: root, workdir: wipDir(), plugins: serverPlugins });

    const handler = createHandler({
      token: "t",
      project: root,
      review,
      frameScript: "",
      openBrowser: () => (opened += 1),
      heartbeat: () => {},
    });

    const open = (): Promise<Response> =>
      handler(
        new Request("http://x/api/open", { method: "POST", headers: { [TOKEN_HEADER]: "t" } }),
      );

    expect((await open()).status).toBe(204);
    expect(opened).toBe(1);
    review.subscribe(() => {});
    await open();
    expect(opened).toBe(1);
  });

  test("a decision carries an element anchor; an element without a selector is refused", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vellum-element-"));
    mkdirSync(join(dir, WIP, ".review"), { recursive: true });
    const review = new Review({ project: dir, workdir: wipDir(), plugins: serverPlugins });

    const handler = createHandler({
      token: "t",
      project: dir,
      review,
      frameScript: "",
      openBrowser: () => {},
      heartbeat: () => {},
    });

    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- an unparsed anchor is the case under test: the route's parser is what grants the type.
    const decide = (anchor: unknown): Promise<Response> =>
      handler(
        new Request("http://x/api/decision", {
          method: "POST",
          headers: { [TOKEN_HEADER]: "t" },
          body: JSON.stringify({
            kind: "feedback",
            annotations: [{ id: "a", doc: `${WIP}mockup.html`, anchor, body: "bigger" }],
          }),
        }),
      );

    const element = { selector: "#pricing > div.card", text: "Pro", label: "div.card" };
    expect((await decide({ kind: "element", elements: [element] })).status).toBe(200);
    expect(await Bun.file(join(dir, WIP, ".review/v0.feedback-1.md")).text()).toContain(
      'element `#pricing > div.card` (div.card): "Pro"',
    );
    expect((await decide({ kind: "element", elements: [{ text: "Pro" }] })).status).toBe(400);
  });

  test("decision round-trips over HTTP, and approve finalizes at once", async () => {
    const bad = await fetch(url("/api/decision"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ kind: "feedback", annotations: [{ id: 1 }] }),
    });

    expect(bad.status).toBe(400);

    const empty = await fetch(url("/api/decision"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        kind: "feedback",
        annotations: [
          {
            id: "a",
            doc: `${WIP}.review/v1.md`,
            anchor: { kind: "text", passages: [] },
            body: "x",
          },
        ],
      }),
    });

    expect(empty.status).toBe(400);

    const approve = await post("/api/decision", JSON.stringify({ kind: "approve" }));
    expect(approve.status).toBe(200);

    const pending = await fetch(url("/api/pending"), { headers: headers() });
    expect(await pending.json()).toEqual({
      kind: "approved",
      version: 1,
      dir: "plans/2026-09-15/routed-plan/",
    });
  });
});
