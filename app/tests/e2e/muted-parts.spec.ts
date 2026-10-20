import { test, expect } from "@playwright/test";

// Regression (Oct 20, 2026): the phone screenshot — a long sentence in
// the current position rendered as one solid bright block, no muted
// parts, even though splitS split it. The muted-part colour rule must
// compute to a dimmed colour for non-active parts in a real browser:
// active part fully bright, sibling parts at the floored trail opacity
// (45% by default), and stepping must move the bright part.
test.use({ viewport: { width: 390, height: 844 } });

const S1 = "Just three things: a mind-set, a skill set, and a tool kit.";
const S2 =
  "I shamelessly stole the idea of mind-set, skill set, and tool kit from my friend Gerhard Gschwandtner, the charismatic publisher of Selling Power magazine and, concerning the topics of sales and success, one of the most curious, thoughtful people I know.";
const S3 =
  "I don't know where Gerhard came up with this powerful trio, but as soon as I heard it, I knew it was the framework I needed.";

test("long sentence: one bright part, the rest muted, stepping moves the bright part", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.getByTestId("add-book-btn").click();
  await page.getByTestId("add-tab-paste").click();
  await page.getByTestId("paste-title").fill("Muted parts regression");
  await page.getByTestId("paste-text").fill([S1, S2, S3].join(" "));
  await page.getByTestId("paste-save").click();
  await page.getByTestId("current-item").waitFor();

  // S1 is a single part: one step lands on the long sentence, part 0.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  const current = page.getByTestId("current-item");
  await expect(current).toContainText("shamelessly stole");

  const parts = current.locator(".pt");
  const n = await parts.count();
  expect(n).toBeGreaterThan(1);
  await expect(parts.nth(0)).toHaveClass(/on/);
  await expect(parts.nth(1)).not.toHaveClass(/on/);

  await page.waitForTimeout(600); // colour transitions settle
  const c0 = await parts
    .nth(0)
    .evaluate((el) => getComputedStyle(el).color);
  const c1 = await parts
    .nth(1)
    .evaluate((el) => getComputedStyle(el).color);
  console.log("active part colour:", c0, "| muted part colour:", c1);
  expect(c0).not.toBe(c1);
  // The muted part is the trail colour at the 45 floor, not solid white:
  // its computed colour must carry an alpha well under 1.
  const alpha = c1.match(/\/\s*([\d.]+)\s*\)/);
  if (alpha) expect(parseFloat(alpha[1])).toBeLessThan(0.6);

  // Stepping moves the bright part within the same sentence.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("current-item")).toContainText(
    "shamelessly stole",
  );
  await expect(parts.nth(1)).toHaveClass(/on/);
  await expect(parts.nth(0)).not.toHaveClass(/on/);
});
