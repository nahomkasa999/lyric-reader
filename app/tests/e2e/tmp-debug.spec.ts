import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("debug: open the sample book", async ({ page }) => {
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  const row = page.locator('[data-testid^="open-book-"]').first();
  console.log("ROWCOUNT", await row.count());
  console.log("ROWBOX", await row.boundingBox());
  await row.click();
  await page.waitForTimeout(3000);
  console.log("URL", page.url());
  console.log("CURRENT?", await page.getByTestId("current-item").count());
});
