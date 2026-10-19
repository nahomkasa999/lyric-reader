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
  await page.getByTestId("current-item").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // let the entry animation settle
}

test.describe("screenshots", () => {
  test("phone: library, reader, split sentence, popup, page input, bottom nav, settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Library
    await page.goto("/");
    await page.getByTestId("upload-btn").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/library-phone.png` });

    // Reader at a page start (3-zone spacing: past / current / next)
    await openSample(page);
    const current = page.getByTestId("current-item");
    for (let i = 0; i < 40 && !(await current.innerText()).includes("edge of the stairs"); i++)
      await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-mid-phone.png` });

    // Split long sentence: navigate to the brass-lamp sentence, step to part 2
    for (let i = 0; i < 40 && !(await current.innerText()).includes("brass lamp"); i++)
      await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // part 2 lit, part 1 muted
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-parts-phone.png` });

    // Action popup anchored at the sentence, with the fx focus effect
    // (double-tap part 0 of the split sentence — deterministic)
    await page.waitForTimeout(450); // let the track settle
    const pbox = await current.locator('[data-p="0"]').boundingBox();
    if (!pbox) throw new Error("no part box");
    const px = pbox.x + pbox.width / 2;
    const py = pbox.y + pbox.height / 2;
    await page.mouse.click(px, py);
    await page.mouse.click(px, py);
    await page.getByTestId("popup-card").waitFor();
    await page.waitForTimeout(700); // stagger + anchor settle
    await page.screenshot({ path: `${SHOTS}/popup-phone.png` });
    await page.keyboard.press("Escape");

    // Inline page input in edit state
    const input = page.getByTestId("page-input");
    await input.click();
    await input.fill("4");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/page-input-phone.png` });
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
    await page.getByTestId("settings-back").click();

    // Saved view, populated: bookmark item 2, note on the brass-lamp part
    await page.getByTestId("reader-root").waitFor();
    const input2 = page.getByTestId("page-input");
    await input2.click();
    await input2.fill("1");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(450);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    {
      const b = await page.getByTestId("current-item").boundingBox();
      await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
      await page.getByTestId("popup-bookmark").click();
      await page.keyboard.press("Escape");
    }
    await input2.click();
    await input2.fill("2");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(450);
    const cur2 = page.getByTestId("current-item");
    for (let i = 0; i < 40 && !(await cur2.innerText()).includes("brass lamp"); i++)
      await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    {
      const pb = await cur2.locator('[data-p="0"]').boundingBox();
      await page.mouse.click(pb!.x + pb!.width / 2, pb!.y + pb!.height / 2);
      await page.mouse.click(pb!.x + pb!.width / 2, pb!.y + pb!.height / 2);
      await page.getByTestId("popup-note").click();
      await page.getByTestId("note-textarea").fill("the lamp is a clue");
      await page.getByTestId("note-save").click();
      await page.keyboard.press("Escape");
    }
    await page.getByTestId("saved-btn").click();
    await page.getByTestId("saved-page").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/saved-phone.png` });
  });

  test("desktop: reader mid-page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSample(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/reader-desktop.png` });
  });
});
