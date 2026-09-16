import type { On } from "claude-code";

export function prompts(on: On, dropping?: () => string | undefined): string[] {
  const texts: string[] = [];

  on("prompt.submit", (_, e) => {
    const drop = dropping?.();

    if (drop !== undefined) return { drop };
    texts.push(e.text);

    return { text: e.text };
  });

  return texts;
}
