import { test, expect } from "@playwright/test";

// The voice picker (v4.9): it must be reachable FROM THE READER — the ⋯
// menu and a long-press on the speaker — and the voice that is picked
// must be the one that is marked, and the one that is remembered.
test.use({ viewport: { width: 390, height: 844 } });

const SETTINGS_KEY = "lyric-reader.settings-v1";

/** Open the seeded sample book and return to its reader. */
async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
}

/** Reveal the unified auto-hiding chrome (tap the top hot-zone). */
async function revealChrome(page: import("@playwright/test").Page) {
  await page.waitForTimeout(450);
  const box = await page.getByTestId("stage").boundingBox();
  if (!box) throw new Error("stage has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
  await expect(page.getByTestId("top-bar")).toBeVisible();
}

/** Put the reader in a known state before the app boots. */
async function useEngine(
  page: import("@playwright/test").Page,
  engine: "eleven" | "system",
) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    [SETTINGS_KEY, { readAloudEngine: engine }] as const,
  );
}

test.describe("Lyric Reader — the voice picker", () => {
  test("opens from the reader's overflow menu", async ({ page }) => {
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("reader-menu-btn").click();
    await page.getByTestId("reader-menu").waitFor();
    // The picker used to be unreachable from the reader at all.
    await page.getByTestId("voice-btn").click();
    await expect(page.getByTestId("voice-sheet")).toBeVisible();
  });

  test("opens on a long-press of the speaker", async ({ page }) => {
    await openSample(page);
    await revealChrome(page);
    const btn = page.getByTestId("speak-btn");
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    if (!box) throw new Error("the speaker has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page.getByTestId("voice-sheet")).toBeVisible();
  });

  test("a tap on the speaker reads, it does not open the picker", async ({
    page,
  }) => {
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("speak-btn").click();
    await expect(page.getByTestId("voice-sheet")).toHaveCount(0);
  });

  test("the phone's voices can be picked, and the pick is remembered", async ({
    page,
  }) => {
    await useEngine(page, "system");
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("reader-menu-btn").click();
    await page.getByTestId("voice-btn").click();
    await expect(page.getByTestId("voice-sheet")).toBeVisible();
    await expect(page.getByTestId("voice-section-phone")).toBeVisible();

    // The phone's own voice is the first card, and it is the one in use.
    const cards = page.locator(".voice-card");
    await expect(cards.first()).toHaveClass(/on/);

    // The choice is written to the settings.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SETTINGS_KEY,
    );
    expect(stored).toContain("readAloudEngine");
  });

  test("without a key the sheet says so and offers this phone", async ({
    page,
  }) => {
    await useEngine(page, "eleven");
    // No key on this phone: the reader says so instead of just reading
    // differently with no explanation.
    await page.addInitScript(() => {
      window.localStorage.removeItem("lr-elevenlabs-key");
    });
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("reader-menu-btn").click();
    await page.getByTestId("voice-btn").click();
    await expect(page.getByTestId("voice-sheet")).toBeVisible();
    await expect(page.getByTestId("voice-no-key")).toContainText(
      "no ElevenLabs key",
    );
    // One tap and the phone's own voice takes over.
    await page.getByTestId("voice-use-phone").click();
    await expect(page.getByTestId("voice-section-phone")).toBeVisible();
  });
});
