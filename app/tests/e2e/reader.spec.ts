import { test, expect } from "@playwright/test";

/** Open the seeded sample book and return to its reader. */
async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("upload-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-sentence").waitFor();
}

test.describe("Lyric Reader", () => {
  test("opens the sample book at the first sentence", async ({ page }) => {
    await openSample(page);
    await expect(page.getByTestId("current-sentence")).toContainText(
      "The Midnight Staircase",
    );
  });

  test("advances exactly one sentence per keypress and grows the trail", async ({
    page,
  }) => {
    await openSample(page);
    const current = page.getByTestId("current-sentence");
    const trail = page.getByTestId("trail-block");

    await page.keyboard.press("ArrowDown");
    await expect(current).toContainText("grandfather clock");

    // 9 more = 10 total advances from the heading
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowDown");
    await expect(trail).toContainText("The Midnight Staircase");
    await expect(trail).toContainText("grandfather clock");
  });

  test("page boundary clears the trail; scrolling back restores it", async ({
    page,
  }) => {
    await openSample(page);
    const current = page.getByTestId("current-sentence");
    const trail = page.getByTestId("trail-block");

    // Walk forward until the trail goes from non-empty to empty:
    // that is the page boundary (clean slate on the new page).
    let sawTrail = false;
    for (let i = 0; i < 40; i++) {
      const t = await trail.innerText();
      if (t.trim().length > 0) sawTrail = true;
      else if (sawTrail) break;
      await page.keyboard.press("ArrowDown");
    }
    expect(sawTrail).toBe(true);
    await expect(trail).toHaveText("");
    await expect(current).not.toContainText("grandfather clock");

    // Step back -> previous page's last sentence, trail fully restored.
    await page.keyboard.press("ArrowUp");
    await expect(trail).toContainText("grandfather clock");
    await expect(trail).toContainText("The Midnight Staircase");
  });

  test("upcoming block previews the next sentences", async ({ page }) => {
    await openSample(page);
    await expect(page.getByTestId("upcoming-block")).toContainText(
      "grandfather clock",
    );
  });

  test("persists position across reload", async ({ page }) => {
    await openSample(page);
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(900); // let the debounced save flush
    const text = await page.getByTestId("current-sentence").innerText();
    await page.reload();
    await expect(page.getByTestId("current-sentence")).toHaveText(text);
  });

  test("tap overlay shows page and progress, back returns to library", async ({
    page,
  }) => {
    await openSample(page);
    await page.mouse.click(195, 420); // middle third -> overlay
    const overlay = page.getByTestId("reader-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId("page-label")).toContainText(/Page 1 of \d+/);
    await expect(page.getByTestId("progress-label")).toContainText(/%/);
    await page.getByTestId("overlay-back").click();
    await expect(page.getByTestId("upload-btn")).toBeVisible();
  });

  test("reader works offline after first load", async ({ page, context }) => {
    await openSample(page);
    // Wait until the service worker actually controls the page.
    await page.waitForFunction(
      () => !!navigator.serviceWorker?.controller,
      null,
      { timeout: 20000 },
    );
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("current-sentence")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("current-sentence")).not.toBeEmpty();
  });
});
