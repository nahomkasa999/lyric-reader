import { test, expect } from "@playwright/test";
import path from "node:path";

// v4.4 auto-scroll: phone-first, like the rest of the suite.
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = path.resolve(
  process.env.HOME ?? "/home/hatch",
  "workspace/lyric-reader/screenshots",
);

/**
 * Seed the auto-scroll speed (default 1× otherwise). The sample book's
 * sentences are long (~13–23 words); 1.5× keeps the suite moving while
 * the pace stays the real paceMs formula — no fake timers.
 */
async function seedSpeed(
  page: import("@playwright/test").Page,
  speed: number,
) {
  await page.addInitScript(
    (s: number) =>
      localStorage.setItem(
        "lyric-reader.settings-v1",
        JSON.stringify({ autoScrollSpeed: s }),
      ),
    speed,
  );
}

async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
}

async function currentText(page: import("@playwright/test").Page) {
  return page.getByTestId("current-item").innerText();
}

async function settle(page: import("@playwright/test").Page) {
  await page.waitForTimeout(450);
}

/** Reveal the unified auto-hiding chrome: tap the top hot-zone. */
async function revealChrome(page: import("@playwright/test").Page) {
  await settle(page);
  const box = await page.getByTestId("stage").boundingBox();
  if (!box) throw new Error("stage has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
  await expect(page.getByTestId("top-bar")).toBeVisible();
}

/** Start auto-scroll: reveal the chrome, tap the button, chrome hides. */
async function startAuto(page: import("@playwright/test").Page) {
  await revealChrome(page);
  await page.getByTestId("autoscroll-btn").click();
  // A long-press must not have cycled the speed on a plain tap.
  await expect(page.getByTestId("autoscroll-speed")).toBeHidden();
}

/** Wait until the current item's text differs from `prev`. */
async function advancedFrom(
  page: import("@playwright/test").Page,
  prev: string,
  timeout = 20000,
) {
  await page.waitForFunction(
    (p: string) =>
      document.querySelector('[data-testid="current-item"]')?.textContent !==
      p,
    prev,
    { timeout },
  );
}

test.describe("Lyric Reader — auto-scroll", () => {
  test("plays part-by-part with no input, chrome hidden", async ({ page }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    await startAuto(page);

    // Starting playback hides the chrome (full focus).
    await expect(page.getByTestId("top-bar")).toHaveClass(/chrome-hidden/, {
      timeout: 8000,
    });

    const t0 = await currentText(page);
    await advancedFrom(page, t0);
    const t1 = await currentText(page);
    await advancedFrom(page, t1);
  });

  test("pause freezes the position", async ({ page }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    await startAuto(page);
    const t0 = await currentText(page);
    await advancedFrom(page, t0);

    await revealChrome(page);
    await page.getByTestId("autoscroll-btn").click();
    await expect(page.getByTestId("autoscroll-btn")).toHaveAttribute(
      "aria-label",
      "Start auto-scroll",
    );
    const frozen = await currentText(page);
    // 9s > 2× the pace of the ~14-word sentences in play at 1.5×.
    await page.waitForTimeout(9000);
    expect(await currentText(page)).toBe(frozen);
  });

  test("rapid toggle spam leaves no stray timers", async ({ page }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    await startAuto(page);
    const t0 = await currentText(page);
    await advancedFrom(page, t0);

    // on → off → on → off, fast. Ends paused. (Re-reveal the chrome
    // between toggles: playing hides it, by design.)
    const btn = page.getByTestId("autoscroll-btn");
    await revealChrome(page);
    await btn.click();
    await revealChrome(page);
    await btn.click();
    await revealChrome(page);
    await btn.click();
    await expect(btn).toHaveAttribute("aria-label", "Start auto-scroll");
    const frozen = await currentText(page);
    await page.waitForTimeout(9000);
    expect(await currentText(page)).toBe(frozen);
  });

  test("manual step while playing advances and playback continues", async ({
    page,
  }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    await startAuto(page);
    const t0 = await currentText(page);
    await advancedFrom(page, t0);

    // Manual step: the timer restarts for the new part, playback goes on.
    await page.keyboard.press("ArrowDown");
    const t1 = await currentText(page);
    expect(t1).not.toBe(t0);
    await advancedFrom(page, t1);
  });

  test("the popup pauses playback and closing it resumes", async ({
    page,
  }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    // Item 10: the 2-part brass-lamp sentence.
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await startAuto(page);
    const current = page.getByTestId("current-item");
    // Auto-advance to part 1 (23-word sentence ≈ 5.8s at 1.5×).
    await expect(current.locator('[data-p="1"]')).toHaveClass(/on/, {
      timeout: 15000,
    });

    // Double-tap the active part: the popup opens, playback pauses.
    await settle(page);
    const box = await current.locator('[data-p="1"]').boundingBox();
    if (!box) throw new Error("part has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.mouse.click(x, y);
    await page.getByTestId("popup-card").waitFor();
    const held = await currentText(page);
    await page.waitForTimeout(8000); // past 2× the part's pace
    expect(await currentText(page)).toBe(held);

    // Esc closes the popup: playback resumes from the same part.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("popup-card")).toBeHidden();
    await advancedFrom(page, held, 25000);
    await expect(current).toContainText("back door");
  });

  test("a page end flows into the next page automatically", async ({
    page,
  }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    // Jump to page 2; play through its ~7 items into page 3.
    await revealChrome(page);
    const input = page.getByTestId("page-input");
    await input.fill("2");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("2");
    await startAuto(page);

    // ~22s of real pacing at 1.5×; page 3 begins on its own.
    await expect(input).toHaveValue("3", { timeout: 60000 });
  });

  test("space toggles play/pause", async ({ page }) => {
    await seedSpeed(page, 1.5);
    await openSample(page);
    const t0 = await currentText(page);
    await page.keyboard.press(" ");
    await advancedFrom(page, t0, 15000); // space started playback

    await page.keyboard.press(" ");
    const frozen = await currentText(page);
    await page.waitForTimeout(6000);
    expect(await currentText(page)).toBe(frozen);
  });

  test("long-press cycles the speed with a transient label", async ({
    page,
  }) => {
    await openSample(page); // default 1×
    await revealChrome(page);
    const btn = page.getByTestId("autoscroll-btn");
    const box = await btn.boundingBox();
    if (!box) throw new Error("autoscroll button has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(700); // past the ~500ms long-press
    await page.mouse.up();
    const label = page.getByTestId("autoscroll-speed");
    await expect(label).toBeVisible();
    await expect(label).toContainText("1.25×");
    // A long-press must not also toggle playback.
    await expect(btn).toHaveAttribute("aria-label", "Start auto-scroll");
    // The speed survives a reload (persisted in lr-s).
    await page.waitForTimeout(1600); // label fades
    await page.reload();
    const stored = await page.evaluate(() =>
      localStorage.getItem("lyric-reader.settings-v1"),
    );
    expect(stored).toContain('"autoScrollSpeed":1.25');
  });

  test("screenshot: chrome revealed shows ▶ next to ?", async ({ page }) => {
    await openSample(page);
    await page.evaluate(() => document.fonts.ready);
    await revealChrome(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/autoscroll-phone.png` });
  });
});
