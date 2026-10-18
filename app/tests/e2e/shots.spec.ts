import { test, type Page } from "@playwright/test";
import path from "node:path";

const SHOTS = path.resolve(
  process.env.HOME ?? "/home/hatch",
  "workspace/lyric-reader/screenshots",
);

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("upload-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-sentence").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // let the entry animation settle
}

async function stepToText(page: Page, needle: string, max = 80) {
  const current = page.getByTestId("current-sentence");
  for (let i = 0; i < max; i++) {
    const t = await current.innerText();
    if (t.includes(needle)) return;
    await page.keyboard.press("ArrowDown");
  }
  throw new Error(`never reached text containing "${needle}"`);
}

test.describe("screenshots", () => {
  test("phone: library, reader, jump sheet, popup, bottom nav, settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Library
    await page.goto("/");
    await page.getByTestId("upload-btn").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/library-phone.png` });

    // Reader mid-page (trail above, big sentence, upcoming below)
    await openSample(page);
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-mid-phone.png` });

    // Jump sheet with typed input
    await page.getByTestId("page-btn").click();
    await page.getByTestId("jump-sheet").waitFor();
    await page.getByTestId("jump-input").fill("3");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/jump-sheet-phone.png` });
    await page.keyboard.press("Escape");

    // Action popup card open
    await page.mouse.click(195, 422);
    await page.getByTestId("popup-card").waitFor();
    await page.waitForTimeout(600); // let the stagger finish
    await page.screenshot({ path: `${SHOTS}/popup-phone.png` });
    await page.keyboard.press("Escape");

    // Bottom nav visible
    await page.mouse.click(195, 790);
    await page.getByTestId("bottom-nav").waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/bottom-nav-phone.png` });

    // Settings page
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("settings-page").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${SHOTS}/settings-phone.png`,
      fullPage: true,
    });
  });

  test("desktop: reader mid-page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSample(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-desktop.png` });
  });
});
