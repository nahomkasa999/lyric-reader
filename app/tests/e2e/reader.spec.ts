import { test, expect } from "@playwright/test";

// The product is phone-first; run the whole file at phone viewport so
// click coordinates match the design.
test.use({ viewport: { width: 390, height: 844 } });

/** Open the seeded sample book and return to its reader. Fresh context per test. */
async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("upload-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
}

/** Current item/part text as the reader sees it. */
async function currentText(page: import("@playwright/test").Page) {
  return page.getByTestId("current-item").innerText();
}

/** Let the track's .35s transition settle before reading click coordinates. */
async function settle(page: import("@playwright/test").Page) {
  await page.waitForTimeout(450);
}

/** Click the centre of the current item (the single-part popup path). */
async function tapCurrentItem(page: import("@playwright/test").Page) {
  await settle(page);
  const box = await page.getByTestId("current-item").boundingBox();
  if (!box) throw new Error("current item has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByTestId("popup-card").waitFor();
}

/** Double-tap a specific part of the current item to open the popup. */
async function dblTapPart(
  page: import("@playwright/test").Page,
  part: number,
) {
  await settle(page);
  const box = await page
    .getByTestId("current-item")
    .locator(`[data-p="${part}"]`)
    .boundingBox();
  if (!box) throw new Error("part has no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await page.getByTestId("popup-card").waitFor();
}

test.describe("Lyric Reader — core flows", () => {
  test("opens the sample book at the first item (a heading)", async ({ page }) => {
    await openSample(page);
    await expect(page.getByTestId("current-item")).toContainText(
      "The Midnight Staircase",
    );
    await expect(page.getByTestId("page-label")).toContainText(/Page/);
    await expect(page.getByTestId("page-input")).toHaveValue("1");
  });

  test("advances exactly one part per keypress", async ({ page }) => {
    await openSample(page);
    const current = page.getByTestId("current-item");
    await page.keyboard.press("ArrowDown");
    await expect(current).toContainText("grandfather clock");
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowDown");
    // Item 10 is the 2-part brass-lamp sentence.
    await expect(current).toContainText("brass lamp");
    // One more step moves to part 2 of the SAME sentence (per-part stepping).
    await page.keyboard.press("ArrowDown");
    await expect(current).toContainText("brass lamp");
    const parts = current.locator(".pt");
    await expect(parts).toHaveCount(2);
    await expect(parts.nth(1)).toHaveClass(/on/);
    await expect(parts.nth(0)).not.toHaveClass(/on/);
  });

  test("current part is bright, sibling parts sit in trail colour", async ({
    page,
  }) => {
    await openSample(page);
    // 11 presses: items 1..10, then part 1 of the split brass-lamp sentence.
    for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowDown");
    const current = page.getByTestId("current-item");
    const parts = current.locator(".pt");
    await expect(parts).toHaveCount(2);
    await expect(parts.nth(1)).toHaveClass(/on/);
    // The non-current part of the current sentence is not bright.
    await expect(parts.nth(0)).not.toHaveClass(/on/);
  });

  test("visibility window: only current ± window is shown", async ({ page }) => {
    await openSample(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    // Item 4 is current: items 0,1 are past, item 5 is next; item 6 is far.
    const far = page.locator('[data-item="6"]');
    await expect(far).toHaveClass(/far/);
    const next = page.locator('[data-item="5"]');
    await expect(next).not.toHaveClass(/far/);
  });

  test("page boundary rebuilds the track; position (item+part) persists", async ({
    page,
  }) => {
    await openSample(page);
    // Walk to item 10 (page 2, the 2-part sentence), then to its part 2.
    for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("page-input")).toHaveValue("2");
    await page.waitForTimeout(900); // debounced save
    const text = await currentText(page);
    await page.reload();
    await page.getByTestId("current-item").waitFor();
    expect(await currentText(page)).toBe(text);
    await expect(page.getByTestId("page-input")).toHaveValue("2");
  });

  test("reader works offline after first load", async ({ page, context }) => {
    await openSample(page);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {
      timeout: 20000,
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("current-item")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("current-item")).not.toBeEmpty();
  });
});

test.describe("Lyric Reader — clicks are the primary input", () => {
  test("tapping the next sentence advances one step", async ({ page }) => {
    await openSample(page);
    const next = page.locator('[data-item="1"]');
    const box = await next.boundingBox();
    if (!box) throw new Error("no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("current-item")).toContainText(
      "grandfather clock",
    );
  });

  test("tapping the previous sentence steps back", async ({ page }) => {
    await openSample(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const prev = page.locator('[data-item="1"]');
    const box = await prev.boundingBox();
    if (!box) throw new Error("no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("current-item")).toContainText(
      "grandfather clock",
    );
  });

  test("tapping a non-adjacent sentence does nothing", async ({ page }) => {
    await openSample(page);
    const far = page.locator('[data-item="3"]');
    const box = await far.boundingBox();
    if (!box) throw new Error("no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("current-item")).toContainText(
      "The Midnight Staircase",
    );
  });

  test("tapping the muted half of a split sentence activates that half", async ({
    page,
  }) => {
    await openSample(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    const current = page.getByTestId("current-item");
    const part2 = current.locator('[data-p="1"]');
    const box = await part2.boundingBox();
    if (!box) throw new Error("no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(part2).toHaveClass(/on/);
  });

  test("double-tap on the active part opens the popup", async ({ page }) => {
    await openSample(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    const current = page.getByTestId("current-item");
    const part = current.locator('[data-p="0"]');
    const box = await part.boundingBox();
    if (!box) throw new Error("no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.mouse.click(x, y);
    await expect(page.getByTestId("popup-card")).toBeVisible();
  });

  test("single tap on a single-part sentence opens the popup", async ({
    page,
  }) => {
    await openSample(page);
    await tapCurrentItem(page);
    await expect(page.getByTestId("action-popup")).toBeVisible();
    const card = page.getByTestId("popup-card");
    // Four rows in his order: Bookmark, Highlight, Note, Copy.
    await expect(card.locator("button")).toHaveCount(4);
    await expect(page.getByTestId("popup-bookmark")).toContainText("Bookmark");
    await expect(page.getByTestId("popup-note")).toContainText("Note");
    // Staggered micro-animation: rows resolve entrance delays in order.
    const delays = await card
      .locator("button")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDelay));
    expect(new Set(delays).size).toBe(4);
  });
});

test.describe("Lyric Reader — popup focus effect", () => {
  test("opening the popup applies .fx; closing removes it", async ({ page }) => {
    await openSample(page);
    const root = page.getByTestId("reader-root");
    await expect(root).not.toHaveClass(/fx/);
    await tapCurrentItem(page);
    await expect(root).toHaveClass(/fx/);
    // The chrome actually blurs: computed filter on the top bar.
    const blur = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".reader-bar")!).filter,
    );
    expect(blur).not.toBe("none");
    await page.keyboard.press("Escape");
    await expect(root).not.toHaveClass(/fx/);
    await page.waitForTimeout(450); // let the 0.3s blur transition finish
    const blurAfter = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".reader-bar")!).filter,
    );
    expect(blurAfter).toBe("none");
  });
});

test.describe("Lyric Reader — popup actions work on the part", () => {
  test("highlight washes only the active part and persists", async ({ page }) => {
    await openSample(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await dblTapPart(page, 0);
    const row = page.getByTestId("popup-highlight");
    await row.click();
    // The wash lands on the active part span, not the whole sentence.
    const current = page.getByTestId("current-item");
    await expect(current.locator('[data-p="0"].hl')).toHaveCount(1);
    await expect(current.locator('[data-p="1"].hl')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByTestId("current-item").waitFor();
    // Position was mid-book; reload restores it via the persisted position.
    const restored = page.getByTestId("current-item");
    await expect(restored.locator(".pt.hl")).toHaveCount(1);
  });

  test("bookmark drops a dot after the part", async ({ page }) => {
    await openSample(page);
    await tapCurrentItem(page);
    await page.getByTestId("popup-bookmark").click();
    await expect(
      page.getByTestId("current-item").locator(".pt.bm"),
    ).toHaveCount(1);
    await page.keyboard.press("Escape");
  });

  test("copy writes the part text and shows Copied", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openSample(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await dblTapPart(page, 0);
    await page.getByTestId("popup-copy").click();
    await expect(page.getByTestId("popup-copy")).toContainText("Copied");
    const clipped = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipped).toBe(
      "The brass lamp on the landing had burned out hours ago,",
    );
  });
});

test.describe("Lyric Reader — inline page number", () => {
  test("page label reads Page [n] / N · pct%", async ({ page }) => {
    await openSample(page);
    await expect(page.getByTestId("page-label")).toContainText(/Page/);
    await expect(page.getByTestId("page-label")).toContainText(/\/ 10 · 0%/);
  });

  test("typing a page into the bar jumps there — no popup anywhere", async ({
    page,
  }) => {
    await openSample(page);
    const input = page.getByTestId("page-input");
    await input.click();
    await input.fill("4");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("4");
    await expect(page.getByTestId("current-item")).toContainText(
      "Take the poker",
    );
  });

  test("999 clamps to the last page; garbage reverts", async ({ page }) => {
    await openSample(page);
    const input = page.getByTestId("page-input");
    await input.click();
    await input.fill("999");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("10");
    await input.click();
    await input.fill("abc");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("10");
  });

  test("Escape cancels the edit and restores the number", async ({ page }) => {
    await openSample(page);
    const input = page.getByTestId("page-input");
    await input.click();
    await input.fill("5");
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("1");
    await expect(page.getByTestId("current-item")).toContainText(
      "The Midnight Staircase",
    );
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

  test("hot-zone tap does not advance the position", async ({ page }) => {
    await openSample(page);
    const before = await currentText(page);
    await page.mouse.click(195, 790);
    await page.waitForTimeout(300);
    expect(await currentText(page)).toBe(before);
  });

  test("› goes to next page, « jumps to the previous heading item", async ({
    page,
  }) => {
    await openSample(page);
    await page.mouse.click(195, 790);
    await page.getByTestId("nav-next-page").click();
    await expect(page.getByTestId("page-input")).toHaveValue("2");
    await page.getByTestId("nav-prev-section").click();
    // Previous heading item before page 2 is item 0 ("The Midnight Staircase").
    await expect(page.getByTestId("current-item")).toContainText(
      "The Midnight Staircase",
    );
    await expect(page.getByTestId("page-input")).toHaveValue("1");
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

  test("font chip changes the reader typeface (Lexend included)", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("font-chip-Lexend").click();
    const stack = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--lr-font"),
    );
    expect(stack).toContain("Lexend");
  });

  test("settings persist across reload", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("setting-main-size").fill("40");
    await page.getByTestId("hl-chip-1").click();
    await page.reload();
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
    expect(hl.trim()).toBe("oklch(0.85 0.17 90)");
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

test.describe("Lyric Reader — notes", () => {
  test("note on a part persists across reload and shows an indicator", async ({
    page,
  }) => {
    await openSample(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await dblTapPart(page, 0);
    await page.getByTestId("popup-note").click();
    await expect(page.getByTestId("note-editor")).toBeVisible();
    await page.getByTestId("note-textarea").fill("the lamp is a clue");
    await page.getByTestId("note-save").click();
    // Back at the rows; the Note row now reads "Edit note".
    await expect(page.getByTestId("popup-note")).toContainText("Edit note");
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("current-item").locator(".pt.nt"),
    ).toHaveCount(1);
    await page.reload();
    await page.getByTestId("current-item").waitFor();
    await expect(
      page.getByTestId("current-item").locator(".pt.nt"),
    ).toHaveCount(1);
  });

  test("deleting a note removes the indicator", async ({ page }) => {
    await openSample(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await dblTapPart(page, 0);
    await page.getByTestId("popup-note").click();
    await page.getByTestId("note-textarea").fill("temporary");
    await page.getByTestId("note-save").click();
    await page.getByTestId("popup-note").click();
    await expect(page.getByTestId("note-textarea")).toHaveValue("temporary");
    await page.getByTestId("note-delete").click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("current-item").locator(".pt.nt"),
    ).toHaveCount(0);
  });
});

test.describe("Lyric Reader — Saved view", () => {
  test("empty state when nothing is saved", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("saved-btn").click();
    await expect(page.getByTestId("saved-page")).toBeVisible();
    await expect(page.getByTestId("saved-empty")).toContainText(
      "Nothing saved yet",
    );
    await page.getByTestId("saved-back").click();
    await expect(page.getByTestId("reader-root")).toBeVisible();
  });

  test("Saved lists bookmark, highlight and note; tapping jumps to the part", async ({
    page,
  }) => {
    await openSample(page);
    // Bookmark item 2 (single-part sentence).
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await tapCurrentItem(page);
    await page.getByTestId("popup-bookmark").click();
    await page.keyboard.press("Escape");
    // Highlight part 1 of the split brass-lamp sentence (item 10).
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
    await dblTapPart(page, 1);
    await page.getByTestId("popup-highlight").click();
    await page.keyboard.press("Escape");
    // Note on part 0 of the same sentence.
    await dblTapPart(page, 0);
    await page.getByTestId("popup-note").click();
    await page.getByTestId("note-textarea").fill("lamp clue");
    await page.getByTestId("note-save").click();
    await page.keyboard.press("Escape");

    await page.getByTestId("saved-btn").click();
    await expect(page.getByTestId("saved-page")).toBeVisible();
    await expect(page.getByTestId("saved-entry-2-0")).toBeVisible();
    await expect(page.getByTestId("saved-entry-10-1")).toBeVisible();
    const noteEntry = page.getByTestId("saved-entry-10-0");
    await expect(noteEntry).toContainText("lamp clue");

    // Tapping the highlight entry lands the reader on that exact part.
    await page.getByTestId("saved-entry-10-1").click();
    await page.getByTestId("current-item").waitFor();
    const current = page.getByTestId("current-item");
    await expect(current).toContainText("brass lamp");
    await expect(current.locator('[data-p="1"]')).toHaveClass(/on/);
    await expect(current.locator('[data-p="0"]')).not.toHaveClass(/on/);
  });

  test("Saved is reachable from the library header", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("upload-btn").waitFor();
    await page.getByTestId("library-saved-btn").click();
    await expect(page.getByTestId("saved-page")).toBeVisible();
    await page.getByTestId("saved-back").click();
    await expect(page.getByTestId("library-root")).toBeVisible();
  });
});
