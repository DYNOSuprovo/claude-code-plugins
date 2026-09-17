/** Best effort: the URL is also logged in the session, for a host with no opener or no display. */
export function openInBrowser(url: string): void {
  // `bun test` starts the real server on port 0; without this every run opens a tab.
  if (process.env.NODE_ENV === "test") return;
  const opener = process.platform === "darwin" ? "open" : "xdg-open";

  try {
    Bun.spawn([opener, url], { stdio: ["ignore", "ignore", "ignore"], detached: true }).unref();
  } catch (cause) {
    console.error(`vellum: could not open the browser with ${opener}: ${String(cause)}`);
  }
}
