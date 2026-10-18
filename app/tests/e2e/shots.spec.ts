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
  test("phone: library, reader states, overlay", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("upload-btn").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${SHOTS}/library-phone.png` });

    await openSample(page);
    await page.screenshot({ path: `${SHOTS}/reader-start-phone.png` });

    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-mid-phone.png` });

    await stepToText(page, "Take the poker from the study.");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-bullet-phone.png` });

    await page.mouse.click(195, 420);
    await page.getByTestId("reader-overlay").waitFor();
    await page.screenshot({ path: `${SHOTS}/reader-overlay-phone.png` });
  });

  test("desktop: reader mid-page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSample(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-desktop.png` });
  });
});
