import type { Locator, Page } from "@playwright/test";

import type { Vellum } from "./harness.ts";
import { boxOf, commentOn, dragText, expect, openVellum, reviewV1, test } from "./harness.ts";

/**
 * What the page names: a card says the plan's version and a line, a code block is quoted by
 * its first line, a diagram by its kind, a mockup's element by its label; the rail tells two
 * documents apart and keeps a long name's extension; a card leads to its passage and the list
 * to a new card; the general box beside the plan comments the plan; the transcript's foot says
 * who ended the grill.
 */

const ROUND_1 = [
  ["Storage", "IndexedDB or localStorage?", "IndexedDB."],
  ["Conflicts", "Who wins?", "The inspector."],
] as const;

/** Comments the block under `locator` with `text`, by a click that picks the whole block. */
async function commentBlock(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const box = await boxOf(locator);
  await page.mouse.click(box.x + 40, box.y + 8);
  await expect(page.locator(".popover textarea")).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".comments .card", { hasText: text })).toHaveCount(1);
}

function scrollTop(page: Page): Promise<number> {
  return page
    .locator(".pane")
    .first()
    .evaluate((pane) => pane.scrollTop);
}

test.describe("what a card says", () => {
  test("the plan by its version, a passage by its line", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").first(), 4, 30);
    await page.keyboard.type("Which forms?");
    await page.keyboard.press("Control+Enter");

    await expect(page.locator(".comments .card .where")).toHaveText("Plan v1 · line 3");
    await expect(page.locator(".global label")).toHaveText("Comment on Plan v1");
    await expect(page.locator(".doc-head .path")).toHaveText("Plan v1");
  });

  test("a code block by its first line and its length, in mono; a diagram by its kind", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await commentBlock(page, page.locator("article.plan pre").first(), "Why a map?");
    const code = page.locator(".comments .card .quote").first();
    await expect(code).toContainText("export type Draft = {");
    await expect(code).toContainText("(14 lines)");
    await expect(code).not.toContainText("readonly id");
    expect(await code.evaluate((quote) => getComputedStyle(quote).fontFamily)).toContain("Mono");

    const figure = page.locator("article.plan figure.mermaid").first();
    await expect(figure.locator("svg")).toBeVisible();
    await commentBlock(page, figure, "Show the retry path.");
    await expect(page.locator(".comments .card .quote").nth(1)).toHaveText("“diagram (sequence)”");
  });

  test("a mockup's element by its label, never a selector", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await page.locator("#rail button", { hasText: "mockup.html" }).click();
    await commentOn(page);
    const frame = page.frameLocator(".pane iframe").last();
    await frame.locator("h1").click();
    // Control held first: the composer lets the pointer through before the click is checked.
    await page.keyboard.down("Control");
    await frame.locator("label[for=notes]").click();
    await page.keyboard.up("Control");
    await expect(page.locator(".popover .quote")).toHaveCount(2);
    await page.keyboard.type("Name the two the same way.");
    await page.keyboard.press("Control+Enter");

    await expect(page.locator(".comments .card .where")).toHaveText("mockup.html · h1, label");
  });
});

test.describe("the rail", () => {
  test.describe("with nested folders", () => {
    test.use({ fixture: "rail-nested" });

    test("tells two documents of the same name apart, and two folders of the same name", async ({
      page,
      vellum,
    }) => {
      await reviewV1(page, vellum);
      const twins = page.locator("#rail button", { hasText: "formulaire.html" });
      await expect(twins).toHaveCount(2);
      await expect(twins.nth(0).locator(".dir")).toHaveText("apres");
      await expect(twins.nth(1).locator(".dir")).toHaveText("avant");

      const cited = page.locator("#rail .away button");
      await expect(cited.filter({ hasText: "architecture.md" }).locator(".dir")).toHaveText(
        "vellum/docs",
      );
      await expect(cited.filter({ hasText: "plugin-testing.md" }).locator(".dir")).toHaveText(
        "docs",
      );
    });
  });

  test("keeps a long name's extension, and widens with the window", async ({ page, vellum }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await reviewV1(page, vellum);
    expect((await boxOf(page.locator("#rail"))).width).toBeGreaterThanOrEqual(300);
    const row = page.locator("#rail button", { hasText: "a-very-long" });
    const ext = row.locator(".ext");
    await expect(ext).toHaveText(".md");

    const [name, extension, button] = [
      await boxOf(row.locator(".name")),
      await boxOf(ext),
      await boxOf(row),
    ];

    expect(extension.x + extension.width).toBeLessThanOrEqual(button.x + button.width);
    expect(extension.x + extension.width).toBeLessThanOrEqual(name.x + name.width + 1);

    const stem = row.locator(".stem");
    expect(await stem.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  });
});

test.describe("the list", () => {
  test("a click on a card leads to its passage, and the cards read in the plan's order", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await commentBlock(page, page.locator("article.plan > p").last(), "Then what?");
    await commentBlock(page, page.locator("article.plan > p").first(), "Which forms?");
    const cards = page.locator(".comments .card");
    await expect(cards.nth(0)).toContainText("Which forms?");
    await expect(cards.nth(1)).toContainText("Then what?");

    await page
      .locator(".pane")
      .first()
      .evaluate((pane) => pane.scrollTo(0, 0));
    expect(await scrollTop(page)).toBe(0);
    await cards.nth(1).click({ position: { x: 20, y: 10 } });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(1000);
    const passage = await boxOf(page.locator("article.plan > p").last());
    const pane = await boxOf(page.locator(".pane").first());
    expect(passage.y).toBeGreaterThanOrEqual(pane.y);
    expect(passage.y + passage.height).toBeLessThanOrEqual(pane.y + pane.height);
  });

  test("a comment added scrolls the list to its card", async ({ page, vellum }) => {
    await reviewV1(page, vellum);

    for (let i = 1; i <= 12; i += 1) {
      await page.locator("#global").fill(`Comment ${i}: slice ${i} needs an owner and a check.`);
      await page.getByRole("button", { name: "Add comment" }).click();
    }

    const list = page.locator("#comments .list");
    await expect(page.locator(".comments .card")).toHaveCount(12);
    const last = await boxOf(page.locator(".comments .card").last());
    const box = await boxOf(list);
    expect(last.y + last.height).toBeLessThanOrEqual(box.y + box.height + 1);
  });
});

test.describe("beside the plan", () => {
  test.use({ fixture: "grill-real" });

  async function grilling(page: Page, vellum: Vellum): Promise<void> {
    await vellum.gate();
    await vellum.grill.open("The coverage of the page");
    await vellum.grill.ask(ROUND_1);
    await openVellum(page, vellum);
    await page.locator("#rail button", { hasText: "grill-2.md" }).click();
    await expect(page.locator(".grill-q")).toHaveCount(2);
  }

  test("the general box comments the plan, not the transcript", async ({ page, vellum }) => {
    await grilling(page, vellum);
    await page.locator(".tools [role=switch]", { hasText: "Beside the plan" }).click();
    await expect(page.locator(".global label")).toHaveText("Comment on Plan v1");
    await page.locator("#global").fill("The plan says nothing of the issue.");
    await page.getByRole("button", { name: "Add comment" }).click();

    await expect(page.locator(".comments .card .where")).toHaveText("Plan v1 · general");
    await expect(page.locator("#rail .plate .badge")).toHaveText("1");
  });

  test("the transcript's foot says who ended the grill, and no session", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await page.locator("#rail button", { hasText: "grill-1.md" }).click();
    const sheet = page.locator(".grill-doc");
    await expect(sheet).toContainText("Ended by you");
    await expect(sheet).not.toContainText("session 4cbe3fc8");
    await expect(sheet).not.toContainText("· page");
  });
});
