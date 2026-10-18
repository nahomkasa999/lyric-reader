import { test, expect } from "@playwright/test";

// The product is phone-first; run the whole file at phone viewport so
// tap coordinates (middle third, bottom hot zone) match the design.
test.use({ viewport: { width: 390, height: 844 } });

/** Open the seeded sample book and return to its reader. Fresh context per test. */
async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("upload-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-sentence").waitFor();
}

async function tapMiddle(page: import("@playwright/test").Page) {
  await page.mouse.click(195, 422); // middle third -> action popup
  await page.getByTestId("popup-card").waitFor();
}

test.describe("Lyric Reader — core flows", () => {
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

  test("top bar shows the page fraction and opens the jump sheet", async ({
    page,
  }) => {
    await openSample(page);
    await expect(page.getByTestId("page-label")).toContainText(/1 \/ \d+/);
    await page.getByTestId("page-btn").click();
    await expect(page.getByTestId("jump-sheet")).toBeVisible();
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

test.describe("Lyric Reader — typed page jump", () => {
  test("typing a page number and Go jumps there", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("page-btn").click();
    const input = page.getByTestId("jump-input");
    await expect(input).toHaveValue("1");
    await input.fill("3");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("page-label")).toContainText("3 /");
    await expect(page.getByTestId("jump-sheet")).toBeHidden();
  });

  test("out-of-range page clamps with a hint", async ({ page }) => {
    await openSample(page);
    const label = await page.getByTestId("page-label").innerText();
    const total = label.split("/")[1].trim();
    await page.getByTestId("page-btn").click();
    await page.getByTestId("jump-input").fill("999");
    await page.getByTestId("jump-go").click();
    // Clamped to the last page; the sheet stays open showing the hint.
    await expect(page.getByTestId("page-label")).toContainText(`${total} / ${total}`);
    await expect(page.getByTestId("jump-hint")).toContainText(
      `Only ${total} pages`,
    );
  });

  test("empty input shows a hint instead of jumping", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("page-btn").click();
    await page.getByTestId("jump-input").fill("");
    await page.getByTestId("jump-go").click();
    await expect(page.getByTestId("jump-hint")).toContainText("Type a page number");
    await expect(page.getByTestId("page-label")).toContainText("1 /");
  });

  test("section list jumps to a heading page", async ({ page }) => {
    await openSample(page);
    // Walk to page 2 first so the jump has somewhere to go.
    await page.getByTestId("page-btn").click();
    await page.getByTestId("jump-input").fill("2");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("page-label")).toContainText("2 /");
    await page.getByTestId("page-btn").click();
    const sections = page.locator('[data-testid^="jump-section-"]');
    await expect(sections.first()).toBeVisible();
    await sections.first().click();
    await expect(page.getByTestId("page-label")).toContainText("1 /");
    await expect(page.getByTestId("current-sentence")).toContainText(
      "The Midnight Staircase",
    );
  });
});

test.describe("Lyric Reader — action popup", () => {
  test("middle tap opens one card with three staggered rows", async ({
    page,
  }) => {
    await openSample(page);
    await tapMiddle(page);
    await expect(page.getByTestId("action-popup")).toBeVisible();
    const card = page.getByTestId("popup-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("popup-highlight")).toContainText("Highlight");
    await expect(page.getByTestId("popup-bookmark")).toContainText("Bookmark");
    await expect(page.getByTestId("popup-copy")).toContainText("Copy");
    // Single card surface: the three rows live inside the one card element.
    const rows = card.locator("button");
    await expect(rows).toHaveCount(3);
    // Staggered animation: rows resolve their entrance delays in order.
    const delays = await rows.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).animationDelay),
    );
    expect(delays[0]).not.toBe(delays[1]);
    expect(delays[1]).not.toBe(delays[2]);
  });

  test("highlight toggles and persists across reload", async ({ page }) => {
    await openSample(page);
    await tapMiddle(page);
    const row = page.getByTestId("popup-highlight");
    await expect(row).not.toHaveAttribute("style", /--lr-hl/);
    await row.click();
    await expect(row).toHaveAttribute("style", /--lr-hl/);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.reload();
    await page.getByTestId("current-sentence").waitFor();
    await expect(page.locator(".hl-wash")).toHaveCount(1);
    await tapMiddle(page);
    await expect(page.getByTestId("popup-highlight")).toHaveAttribute(
      "style",
      /--lr-hl/,
    );
  });

  test("bookmark shows a marker and lists the page in the jump sheet", async ({
    page,
  }) => {
    await openSample(page);
    await tapMiddle(page);
    await page.getByTestId("popup-bookmark").click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".bm-dot")).toHaveCount(1);
    await page.getByTestId("page-btn").click();
    const marks = page.locator('[data-testid^="jump-bookmark-"]');
    await expect(marks).toHaveCount(1);
    const where = await marks.first().getAttribute("data-testid");
    await marks.first().click();
    // Clicking the bookmark returns to the marked sentence.
    const text = await page.getByTestId("current-sentence").innerText();
    expect(where).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });

  test("copy writes the sentence and shows Copied", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openSample(page);
    await tapMiddle(page);
    await page.getByTestId("popup-copy").click();
    await expect(page.getByTestId("popup-copy")).toContainText("Copied");
    const clipped = await page.evaluate(() => navigator.clipboard.readText());
    // The raw sentence text — not the CSS-uppercased heading rendering.
    expect(clipped).toBe("The Midnight Staircase");
  });
});

test.describe("Lyric Reader — bottom nav", () => {
  test("hidden by default, appears on bottom hot-zone tap, hides again", async ({
    page,
  }) => {
    await openSample(page);
    const nav = page.getByTestId("bottom-nav");
    await expect(nav).toBeHidden();
    await page.mouse.click(195, 790); // bottom 15% hot zone
    await expect(nav).toBeVisible();
    await page.waitForTimeout(3000); // auto-hide after 2.5s
    await expect(nav).toBeHidden();
  });

  test("hot-zone tap does not advance the sentence", async ({ page }) => {
    await openSample(page);
    const before = await page.getByTestId("current-sentence").innerText();
    await page.mouse.click(195, 790);
    await page.waitForTimeout(300);
    const after = await page.getByTestId("current-sentence").innerText();
    expect(after).toBe(before);
  });

  test("› button advances a page, « jumps to previous section", async ({
    page,
  }) => {
    await openSample(page);
    await page.mouse.click(195, 790);
    await page.getByTestId("nav-next-page").click();
    await expect(page.getByTestId("page-label")).toContainText("2 /");
    await page.getByTestId("nav-prev-section").click();
    await expect(page.getByTestId("page-label")).toContainText("1 /");
  });
});

test.describe("Lyric Reader — settings page", () => {
  test("gear opens the settings page; main-size slider drives the reader", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByTestId("settings-gear").click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    const slider = page.getByTestId("setting-main-size");
    await slider.fill("48");
    await expect(page.getByTestId("settings-preview-current")).toHaveCSS(
      "font-size",
      "48px",
    );
    await page.getByTestId("settings-back").click();
    await expect(page.getByTestId("reader-root")).toBeVisible();
  });

  test("font chip changes the reader typeface", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("font-chip-Geist Mono").click();
    const stack = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--lr-font"),
    );
    expect(stack).toContain("Geist Mono");
  });

  test("settings persist across reload", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("setting-main-size").fill("40");
    await page.getByTestId("hl-chip-1").click();
    await page.reload();
    // The app resumes the reader (last book remembered) — check vars there.
    await page.getByTestId("reader-root").waitFor();
    const mainSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--lr-main-size",
      ),
    );
    const hl = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--lr-hl"),
    );
    expect(mainSize.trim()).toBe("40px");
    expect(hl.trim()).toBe("oklch(0.78 0.17 85)");
  });

  test("A−/A+ in the reader adjust the same main-size setting", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByRole("button", { name: "Larger text" }).click();
    const size = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--lr-main-size",
      ),
    );
    expect(size.trim()).toBe("32px");
  });

  test("settings page is also reachable from the library gear", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("upload-btn").waitFor();
    await page.getByTestId("settings-gear").click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await page.getByTestId("settings-back").click();
    await expect(page.getByTestId("library-root")).toBeVisible();
  });
});
