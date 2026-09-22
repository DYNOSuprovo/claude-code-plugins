import type { Page } from "@playwright/test";

import type { Box, Vellum } from "./harness.ts";
import { boxOf, commentOn, dragText, expect, reviewV1, test } from "./harness.ts";

/**
 * The kit's popover and its placement: the composer stays inside its pane, above the target when
 * the room below is short, follows a mockup's scroll, takes Escape and Ctrl+Enter, hands the
 * focus back; a label is a comment by itself.
 */

/** The pane's visible window, in viewport coordinates, and its scroll. */
function paneWindow(page: Page): Promise<Box & { readonly scrollTop: number }> {
  return page
    .locator(".pane")
    .last()
    .evaluate((pane) => {
      const rect = pane.getBoundingClientRect();

      return {
        x: rect.x,
        y: rect.y,
        width: pane.clientWidth,
        height: pane.clientHeight,
        scrollTop: pane.scrollTop,
      };
    });
}

/** Where the focus is: the tag and text of the active element, `BODY` when nothing holds it. */
function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;

    return element === null || element === document.body
      ? "BODY"
      : `${element.tagName} ${element.textContent?.trim().slice(0, 30) ?? ""}`;
  });
}

function focusInSheet(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest("article.plan") !== null);
}

async function choose(page: Page, name: string): Promise<void> {
  await page.locator("#rail button", { hasText: name }).first().click();
  await expect(page.locator(".pane iframe").last()).toBeVisible();
}

test.describe("the composer stays in the pane", () => {
  test("a word at the end of a line opens it inside the pane's right edge", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await commentOn(page);

    const word = await page
      .locator("article.plan > p")
      .first()
      .evaluate((p) => {
        const node = p.firstChild;

        if (!(node instanceof Text)) throw new Error("no text");
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, 1);
        const firstTop = range.getBoundingClientRect().top;
        let last = { x: 0, y: 0 };

        for (let i = 0; i < node.length - 1; i += 1) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();

          if (Math.abs(rect.top - firstTop) < 2)
            last = { x: rect.left - 5, y: rect.top + rect.height / 2 };
        }

        return last;
      });

    await page.mouse.dblclick(word.x, word.y);
    const popover = page.locator(".popover");
    await expect(popover).toBeVisible();
    const pane = await paneWindow(page);
    const pop = await boxOf(popover);

    expect(pop.x + pop.width).toBeLessThanOrEqual(pane.x + pane.width);
    expect(pop.x).toBeGreaterThanOrEqual(pane.x);
  });

  test("a block near the bottom of the pane opens it above", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    const heading = page.locator("article.plan > h2", { hasText: "Slices" });

    await heading.evaluate((element) => {
      const pane = element.closest(".pane");

      if (pane === null) throw new Error("no pane");
      pane.scrollTop +=
        element.getBoundingClientRect().bottom - pane.getBoundingClientRect().bottom + 40;
    });

    const target = await boxOf(heading);
    await page.mouse.click(target.x + 30, target.y + 8);
    const popover = page.locator(".popover");
    await expect(popover).toBeVisible();
    const pane = await paneWindow(page);
    const pop = await boxOf(popover);

    expect(pop.y + pop.height).toBeLessThanOrEqual(target.y);
    expect(pop.y).toBeGreaterThanOrEqual(pane.y);
  });
});

test.describe("the composer takes keys and hands the focus back", () => {
  test("Escape closes it, and the focus lands on the passage", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").first(), 4, 60);
    await expect(page.locator(".popover textarea")).toBeFocused();
    await page.keyboard.type("Which forms?");
    await page.keyboard.press("Escape");

    await expect(page.locator(".popover")).toHaveCount(0);
    expect(await focusInSheet(page)).toBe(true);
  });

  test("Escape closes it from anywhere in the page, once the focus left it", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").first(), 4, 60);
    await expect(page.locator(".popover textarea")).toBeFocused();
    await page.locator("#global").focus();
    await page.keyboard.press("Escape");

    await expect(page.locator(".popover")).toHaveCount(0);
  });

  test("Ctrl+Enter adds the comment, and the focus lands on the passage", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").first(), 4, 60);
    await page.keyboard.type("Which forms?");
    await page.keyboard.press("Control+Enter");

    await expect(page.locator(".popover")).toHaveCount(0);
    await expect(page.locator(".comments .card")).toHaveCount(1);
    await expect(page.locator(".comments .card")).toContainText("Which forms?");
    expect(await focusInSheet(page)).toBe(true);
  });
});

test.describe("a label is a comment by itself", () => {
  test("a label sends at the click, alone", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    const item = page.locator("article.plan > ol > li").first();
    await item.scrollIntoViewIfNeeded();
    const box = await boxOf(item);
    await page.mouse.click(box.x + 60, box.y + 10);
    await page.locator(".popover .chip", { hasText: "Clarify" }).click();

    const card = page.locator(".comments .card");
    await expect(page.locator(".popover")).toHaveCount(0);
    await expect(card).toHaveCount(1);
    await expect(card.locator(".chip")).toHaveText("Clarify");
    await expect(card.locator(".chip ~ div")).toHaveCount(0);
  });

  test("typed text greys the labels", async ({ page, vellum }) => {
    await reviewV1(page, vellum);
    await commentOn(page);
    await dragText(page, page.locator("article.plan > p").first(), 4, 60);
    const chips = page.locator(".popover .labels .chip");
    await expect(chips.first()).toBeEnabled();
    await page.keyboard.type("x");

    for (const chip of await chips.all()) await expect(chip).toBeDisabled();
  });
});

async function withOneComment(page: Page, vellum: Vellum): Promise<void> {
  await reviewV1(page, vellum);
  await page.locator("#global").fill("One general remark.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator(".comments .card")).toHaveCount(1);
}

test.describe("the bar's popovers", () => {
  test("the warning takes the focus, and Escape closes it and gives the focus back", async ({
    page,
    vellum,
  }) => {
    await withOneComment(page, vellum);
    const approve = page.getByRole("button", { name: "Approve", exact: true });
    await approve.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator(".popover")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".popover")).toHaveCount(0);
    expect(await focused(page)).toBe("BUTTON Approve");
  });

  test("a click outside closes the warning", async ({ page, vellum }) => {
    await withOneComment(page, vellum);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.mouse.click(600, 500);

    await expect(page.locator(".popover")).toHaveCount(0);
  });

  test("the notes popover closes on Escape, on a click outside, and Ctrl+Enter approves", async ({
    page,
    vellum,
  }) => {
    await withOneComment(page, vellum);
    const notes = page.getByRole("button", { name: "Approve with notes…" });
    const anyway = page.getByRole("button", { name: "Approve anyway" });
    await notes.click();
    await anyway.click();
    await expect(page.locator("#approval-notes")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".popover")).toHaveCount(0);
    expect(await focused(page)).toBe("BUTTON Approve with notes…");

    await notes.click();
    await anyway.click();
    await expect(page.locator("#approval-notes")).toBeFocused();
    await page.mouse.click(600, 500);
    await expect(page.locator(".popover")).toHaveCount(0);

    await notes.click();
    await anyway.click();
    await expect(page.locator("#approval-notes")).toBeFocused();
    await page.keyboard.type("Ship it.");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator(".bar .status")).toHaveText("Approved");
  });
});

test.describe("in a mockup", () => {
  test("a pick against the right edge opens the composer inside the pane", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await choose(page, "mockup.html");
    await commentOn(page);
    await page.frameLocator(".pane iframe").last().locator(".pending").click();
    const popover = page.locator(".popover");
    await expect(popover).toBeVisible();
    const pane = await paneWindow(page);
    const pop = await boxOf(popover);

    expect(pop.x + pop.width).toBeLessThanOrEqual(pane.x + pane.width);
  });

  test("a pick added with Ctrl gives the focus back to the composer, and Escape closes it", async ({
    page,
    vellum,
  }) => {
    await reviewV1(page, vellum);
    await choose(page, "mockup.html");
    await commentOn(page);
    const frame = page.frameLocator(".pane iframe").last();
    await frame.locator("h1").click();
    await expect(page.locator(".popover textarea")).toBeFocused();
    await frame.locator("body").click({ position: { x: 4, y: 4 }, modifiers: ["Control"] });
    await expect(page.locator(".popover .quote")).toHaveCount(2);
    await expect(page.locator(".popover textarea")).toBeFocused();
    await page.keyboard.press("Escape");

    await expect(page.locator(".popover")).toHaveCount(0);
  });

  test.describe("that is tall", () => {
    test.use({ fixture: "mockups-edge" });

    test("a pick near the bottom opens the composer above, and scrolls nothing", async ({
      page,
      vellum,
    }) => {
      await reviewV1(page, vellum);
      await choose(page, "long.html");
      await commentOn(page);
      const frame = page.frameLocator(".pane iframe").last();
      await frame.locator("body").evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const archive = frame.locator("#archive");
      await archive.click();
      const popover = page.locator(".popover");
      await expect(popover).toBeVisible();
      const target = await boxOf(archive);
      const pane = await paneWindow(page);
      const pop = await boxOf(popover);

      expect(pop.y + pop.height).toBeLessThanOrEqual(target.y);
      expect(pop.y).toBeGreaterThanOrEqual(pane.y);
      expect(pane.scrollTop).toBe(0);
    });

    test("the composer follows the mockup's scroll", async ({ page, vellum }) => {
      await reviewV1(page, vellum);
      await choose(page, "long.html");
      await commentOn(page);
      const heading = page.frameLocator(".pane iframe").last().locator("section:nth-of-type(3) h2");
      await heading.click();
      const popover = page.locator(".popover");
      await expect(popover).toBeVisible();
      const before = { heading: await boxOf(heading), popover: await boxOf(popover) };
      const frame = await boxOf(page.locator(".pane iframe").last());
      await page.mouse.move(frame.x + frame.width - 30, frame.y + frame.height - 60);

      for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 60);

      await expect.poll(async () => (await boxOf(heading)).y).toBeLessThan(before.heading.y - 200);
      const after = { heading: await boxOf(heading), popover: await boxOf(popover) };

      expect(after.popover.y - before.popover.y).toBeCloseTo(after.heading.y - before.heading.y, 0);
    });
  });
});
