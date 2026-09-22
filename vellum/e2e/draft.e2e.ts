import type { Page } from "@playwright/test";

import type { Vellum } from "./harness.ts";
import { commentOn, dragText, expect, openVellum, reviewV1, test } from "./harness.ts";

/**
 * The draft carries what is typed: a text typed and visible survives a reload and a change of
 * document, End grill sends the answers typed, and every action that would throw a typed text
 * asks first.
 */

const ROUND = [
  ["Storage", "IndexedDB or localStorage for the drafts?", "IndexedDB: no 5 MB cap."],
  ["Conflicts", "Who wins a conflict?", "The inspector, field by field."],
  ["Replay", "When is the queue replayed?", "On the online event."],
] as const;

async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.locator(".bar .brand").waitFor();
  await expect(page.locator(".plan h1")).toBeVisible();
}

async function openEditor(page: Page): Promise<void> {
  await page.locator(".tools").getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".editor textarea")).toBeFocused();
}

function firstLine(page: Page): Promise<string> {
  return page.locator(".editor textarea").evaluate((area) => {
    if (!(area instanceof HTMLTextAreaElement)) throw new Error("no textarea");

    return area.value.split("\n")[0] ?? "";
  });
}

async function addComment(page: Page, text: string): Promise<void> {
  await dragText(page, page.locator("article.plan > p").first(), 4, 60);
  await page.keyboard.type(text);
  await page.locator(".popover").getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator(".comments .card").last()).toContainText(text);
}

test.describe("what is typed comes back after a reload", () => {
  test("the general box", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await page.locator("#global").fill("The slices lack an owner.");
    await expect.poll(async () => (await vellum.api("draft")).status).toBe(200);
    await reload(page);

    await expect(page.locator("#global")).toHaveValue("The slices lack an owner.");
  });

  test("a composer opened again on the same document", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").first(), 4, 60);
    await page.keyboard.type("Which forms?");
    await expect.poll(async () => (await vellum.api("draft")).status).toBe(200);
    await reload(page);

    await expect(page.locator(".popover")).toHaveCount(0);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").nth(1), 0, 15);
    await expect(page.locator(".popover textarea")).toHaveValue("Which forms?");
  });

  test("the editor opened again on the same version", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await openEditor(page);
    await page.keyboard.type("Reviewer: every slice needs an owner.\n");
    await expect.poll(async () => (await vellum.api("draft")).status).toBe(200);
    await reload(page);

    await expect(page.locator(".editor textarea")).toHaveCount(0);
    await openEditor(page);
    expect(await firstLine(page)).toBe("Reviewer: every slice needs an owner.");
  });
});

/** A grill opened on the fixture's plan, its first round asked, the transcript shown. */
async function roundOne(page: Page, vellum: Vellum): Promise<void> {
  await vellum.gate();
  await vellum.grill.open("Where do drafts live?");
  await vellum.grill.ask(ROUND);
  await openVellum(page, vellum);
  await page.locator("#rail button", { hasText: "grill-2.md" }).click();
  await expect(page.locator(".grill-q")).toHaveCount(3);
}

test.describe("the grill's answers", () => {
  test.use({ fixture: "grill-real" });

  test("survive a trip to another document", async ({ page, vellum }) => {
    await roundOne(page, vellum);
    await page
      .locator(".grill-q")
      .nth(0)
      .locator("textarea")
      .fill("IndexedDB, one store per form.");
    await page.locator(".grill-q").nth(1).locator("textarea").fill("The inspector.");
    await page.locator("#rail button", { hasText: "pourquoi-issue-139.md" }).click();
    await expect(page.locator(".grill-q")).toHaveCount(0);
    await page.locator("#rail button", { hasText: "grill-2.md" }).click();

    await expect(page.locator(".grill-q").nth(0).locator("textarea")).toHaveValue(
      "IndexedDB, one store per form.",
    );
    await expect(page.locator(".grill-q").nth(1).locator("textarea")).toHaveValue("The inspector.");
  });

  test("survive a reload, the note too", async ({ page, vellum }) => {
    await roundOne(page, vellum);
    await page.locator(".grill-q").nth(0).locator("textarea").fill("IndexedDB.");
    await page.locator(".grill-foot textarea").fill("Explain the issue first.");
    await expect.poll(async () => (await vellum.api("draft")).status).toBe(200);
    await page.reload();
    await page.locator(".bar .brand").waitFor();
    await page.locator("#rail button", { hasText: "grill-2.md" }).click();

    await expect(page.locator(".grill-q").nth(0).locator("textarea")).toHaveValue("IndexedDB.");
    await expect(page.locator(".grill-foot textarea")).toHaveValue("Explain the issue first.");
  });

  test("End grill sends the two answers typed, then ends", async ({ page, vellum }) => {
    await roundOne(page, vellum);
    await page.locator(".grill-q").nth(1).locator("textarea").fill("The inspector.");
    await page.locator(".grill-q").nth(2).locator("textarea").fill("Every 30 s as well.");
    await page.getByRole("button", { name: "End grill" }).click();

    await expect(page.locator(".grill-foot")).toHaveCount(0);
    await expect(page.locator(".grill-q").nth(1).locator(".answer .text")).toHaveText(
      "The inspector.",
    );
    const state = await vellum.grill.state();
    expect(JSON.stringify(state.json)).toContain("Q2: The inspector.\\n\\nQ3: Every 30 s as well.");
    expect(JSON.stringify(state.json)).toContain('"kind":"ended"');
  });
});

test.describe("an action that would throw a typed text asks first", () => {
  test("Send feedback names the general box, and sends once agreed", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await addComment(page, "Say which forms.");
    await page.locator("#global").fill("The slices lack an owner.");
    await page.getByRole("button", { name: "Send feedback" }).click();

    const warning = page.getByRole("dialog");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("general");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(warning).toHaveCount(0);
    await expect(page.locator(".bar .status")).toHaveText("In review");

    await page.getByRole("button", { name: "Send feedback" }).click();
    await page.getByRole("button", { name: "Send anyway" }).click();
    await expect(page.locator(".bar .status")).toHaveText("Feedback sent");
    await expect(page.locator("#global")).toHaveValue("");
  });

  test("Cancel in the editor with a text typed asks, and keeps the editor on Cancel", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await openEditor(page);
    await page.keyboard.type("Reviewer: a line.\n");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await firstLine(page)).toBe("Reviewer: a line.");

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.locator(".editor textarea")).toHaveCount(0);
    await openEditor(page);
    expect(await firstLine(page)).toBe(
      "# Offline sync for the field inspection app, with conflict review before merge",
    );
  });

  test("Cancel in the editor with nothing typed asks nothing", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await openEditor(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".editor textarea")).toHaveCount(0);
  });
});

test.describe("a card", () => {
  test("Edit reopens its text in place", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await addComment(page, "Say which forms. Tpyo here.");
    const card = page.locator(".comments .card").first();
    await card.getByRole("button", { name: "Edit" }).click();

    const field = card.locator("textarea");
    await expect(field).toHaveValue("Say which forms. Tpyo here.");
    await field.fill("Say which forms. Typo fixed.");
    await card.getByRole("button", { name: "Done" }).click();
    await expect(card.locator("textarea")).toHaveCount(0);
    await expect(card).toContainText("Say which forms. Typo fixed.");
    await expect(card).not.toContainText("Tpyo");
  });
});
