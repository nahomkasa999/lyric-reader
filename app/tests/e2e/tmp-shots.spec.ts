import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("capture the surfaces", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/opencode/shots/01-library.png" });

  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/opencode/shots/02-reader.png" });

  // The meaning card: long-press the first word, then Meaning.
  const el = page.getByTestId("current-item");
  const box = await el.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/opencode/shots/03-selection.png" });

  const pill = page.getByTestId("sel-meaning");
  if (await pill.count()) {
    await pill.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: "/tmp/opencode/shots/04-meaning.png" });
    await page.getByTestId("meaning-close").click();
  }

  // The action popup.
  const cur = await page.getByTestId("current-item").boundingBox();
  if (cur) {
    await page.mouse.click(cur.x + cur.width / 2, cur.y + cur.height / 2);
    await page.waitForTimeout(600);
    await page.screenshot({ path: "/tmp/opencode/shots/05-popup.png" });
  }
});
