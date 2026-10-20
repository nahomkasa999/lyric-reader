import { test, expect } from "@playwright/test";
import path from "node:path";

// Bug #2: the user's own pasted text (3 paragraphs) must part like the
// sample book — part 1 bright, part 2 dull — when the long paragraph is
// the current item.
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = path.resolve(
  process.env.HOME ?? "/home/hatch",
  "workspace/lyric-reader/screenshots",
);

const P1 =
  "The pace numbers are a calm first guess — if it feels slow or rushed after real reading, tell me and I'll tune the formula.";
const P2 =
  "**One thing you must do:** fully close the app (swipe it away) and reopen — your phone was still running an old build in that split screenshot, and this is how the new one takes over + heals the book.";
const P3 =
  "And still open on your side whenever you get a minute: the `VITE_GEMINI_API_KEY` variable in Vercel + Redeploy, so meanings/Ask run on the app key with zero setup.";

test("pasted long paragraph parts with dull/active rendering", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  // The paste form lives in the Add Book sheet now.
  await page.getByTestId("add-book-btn").click();
  await page.getByTestId("add-tab-paste").click();
  await page.getByTestId("paste-title").fill("Pastor test");
  await page.getByTestId("paste-text").fill([P1, P2, P3].join("\n\n"));
  await page.getByTestId("paste-save").click();
  // The paste flow opens the new book directly in the reader.
  await page.getByTestId("current-item").waitFor();

  // Item 0 is the short first paragraph (single part).
  await expect(page.getByTestId("current-item")).toContainText("calm first guess");
  // Step to item 1: the long paragraph.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  const current = page.getByTestId("current-item");
  await expect(current).toContainText("One thing you must do");
  const parts = current.locator(".pt");
  const n = await parts.count();
  console.log("part count on item 1:", n);
  expect(n).toBeGreaterThan(1);
  // Only the current part is bright (has `on`); siblings sit in trail colour.
  await expect(parts.nth(0)).toHaveClass(/on/);
  await expect(parts.nth(1)).not.toHaveClass(/on/);
  // And it is visually distinguishable: computed colours differ.
  const c0 = await parts.nth(0).evaluate((el) => getComputedStyle(el).color);
  const c1 = await parts.nth(1).evaluate((el) => getComputedStyle(el).color);
  console.log("part0 color:", c0, "| part1 color:", c1);
  expect(c0).not.toBe(c1);
  await page.waitForTimeout(600); // transitions settle
  await page.screenshot({ path: `${SHOTS}/parts-dull-active-phone.png` });
});

test("settings shows the build stamp (identifies the running build)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.getByTestId("settings-gear").click();
  await page.getByTestId("settings-page").waitFor();
  const id = page.getByTestId("build-id");
  await expect(id).toBeVisible();
  await expect(id).toContainText(/build \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
});
