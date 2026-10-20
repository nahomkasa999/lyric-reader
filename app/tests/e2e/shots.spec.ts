import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const SHOTS = path.resolve(
  process.env.HOME ?? "/home/hatch",
  "workspace/lyric-reader/screenshots",
);

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // let the entry animation settle
}

/** Reveal the unified auto-hiding chrome (v3.1): tap the top hot-zone. */
async function revealChrome(page: Page) {
  await page.waitForTimeout(450); // let the track transition settle
  const box = await page.getByTestId("stage").boundingBox();
  if (!box) throw new Error("stage has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
  await expect(page.getByTestId("top-bar")).toBeVisible();
}

/** Wait until the whole chrome is hidden — the chrome-free reading stage. */
async function chromeHidden(page: Page) {
  await expect(page.getByTestId("top-bar")).toHaveClass(/chrome-hidden/, {
    timeout: 10000,
  });
}

/**
 * chromeHidden + a beat for the 250ms chrome fade AND any .35s track
 * transition to finish, so screenshots catch the settled stage.
 */
async function chromeSettled(page: Page) {
  await chromeHidden(page);
  await page.waitForTimeout(600);
}

test.describe("screenshots", () => {
  test("phone: library, reader, split sentence, popup, page input, bottom nav, settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Library
    await page.goto("/");
    await page.getByTestId("add-book-btn").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/library-phone.png` });

    // Reader at a page start — chrome-free stage (3-sentence spacing)
    await openSample(page);
    const current = page.getByTestId("current-item");
    for (let i = 0; i < 40 && !(await current.innerText()).includes("edge of the stairs"); i++)
      await page.keyboard.press("ArrowDown");
    await chromeSettled(page);
    await page.screenshot({ path: `${SHOTS}/reader-mid-phone.png` });

    // Split long sentence: navigate to the brass-lamp sentence, step to part 2
    for (let i = 0; i < 40 && !(await current.innerText()).includes("brass lamp"); i++)
      await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // part 2 lit, part 1 muted
    await chromeSettled(page);
    await page.screenshot({ path: `${SHOTS}/reader-parts-phone.png` });

    // Chrome revealed (top hot-zone) — full chrome visible
    await revealChrome(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/reader-chrome-phone.png` });
    await chromeHidden(page);

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
    await revealChrome(page);
    const input = page.getByTestId("page-input");
    await input.click();
    await input.fill("4");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/page-input-phone.png` });
    await page.keyboard.press("Escape");

    // Bottom nav visible
    await page.mouse.click(195, 790);
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/bottom-nav-phone.png` });

    // Settings page
    await revealChrome(page);
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
    await revealChrome(page);
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
    await revealChrome(page);
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
    await revealChrome(page);
    await page.getByTestId("saved-btn").click();
    await page.getByTestId("saved-page").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/saved-phone.png` });
  });

  test("desktop: reader mid-page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSample(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await chromeSettled(page);
    await page.screenshot({ path: `${SHOTS}/reader-desktop.png` });
  });

  test("phone v4: selection pill, meaning card, words, ask sheet, AI settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Stubbed APIs (offline-capable screenshots).
    await page.route("https://api.dictionaryapi.dev/**", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            word: "lamp",
            phonetic: "/læmp/",
            meanings: [
              {
                partOfSpeech: "noun",
                definitions: [
                  {
                    definition: "A device for giving light.",
                    example: "She lit the lamp.",
                  },
                  { definition: "A source of knowledge or guidance." },
                ],
              },
            ],
          },
        ]),
      }),
    );
    await page.route(
      "https://generativelanguage.googleapis.com/**",
      async (route) => {
        // v4.1: model discovery (Test key + generateContent resolution).
        if (route.request().url().includes("/v1beta/models?")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              models: [
                {
                  name: "models/gemini-2.5-flash",
                  supportedGenerationMethods: ["generateContent"],
                },
                {
                  name: "models/gemini-3.5-flash",
                  supportedGenerationMethods: ["generateContent"],
                },
              ],
            }),
          });
        }
        const body = route.request().postDataJSON() as {
          contents?: Array<{ parts?: Array<{ text?: string }> }>;
          generationConfig?: { responseMimeType?: string };
        };
        const text =
          body?.contents
            ?.map((c) => c.parts?.map((p) => p.text ?? "").join(" "))
            .join(" ") ?? "";
        const answer = (t: string) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              candidates: [{ content: { parts: [{ text: t }] } }],
            }),
          });
        if (/Reply with exactly/i.test(text)) return answer("ok");
        return answer(
          "He took it for protection. «Take the poker from the study.»",
        );
      },
    );

    await openSample(page);
    const current = page.getByTestId("current-item");
    for (let i = 0; i < 40 && !(await current.innerText()).includes("brass lamp"); i++)
      await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);

    // Selection pill above a selected word.
    // v4.1: real long-press gesture — custom selection, no native toolbar.
    const pt = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="current-item"]');
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null = null;
      let found: { node: Node; idx: number } | null = null;
      while ((node = walker.nextNode())) {
        const idx = (node.textContent ?? "").toLowerCase().indexOf("lamp");
        if (idx >= 0) {
          found = { node, idx };
          break;
        }
      }
      if (!found) throw new Error("lamp not found");
      const range = document.createRange();
      range.setStart(found.node, found.idx);
      range.setEnd(found.node, found.idx + 4);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.getByTestId("selection-pill").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/selection-pill-phone.png` });

    // Meaning card with the stubbed definition.
    await page.getByTestId("sel-meaning").click();
    await page.getByTestId("meaning-card").waitFor();
    await expect(page.getByTestId("meaning-card")).toContainText(
      "A device for giving light.",
    );
    await page.waitForTimeout(500); // stagger + re-anchor settle
    await page.screenshot({ path: `${SHOTS}/meaning-card-phone.png` });

    // Save the word, then show the Words view.
    await page.getByTestId("meaning-save").click();
    await expect(page.getByTestId("meaning-save")).toContainText("Saved");
    await page.getByTestId("meaning-close").click();

    // v4.1: note editor card (FIX 3 regression shot — must sit fully
    // inside the viewport, Save button visible).
    const nbox = await page
      .getByTestId("current-item")
      .locator('[data-p="0"]')
      .boundingBox();
    if (!nbox) throw new Error("part 0 has no box");
    await page.mouse.click(nbox.x + nbox.width / 2, nbox.y + nbox.height / 2);
    await page.waitForTimeout(150);
    if ((await page.getByTestId("popup-card").count()) === 0) {
      await page.mouse.click(nbox.x + nbox.width / 2, nbox.y + nbox.height / 2);
    }
    await page.getByTestId("popup-card").waitFor();
    await page.getByTestId("popup-note").click();
    await page.getByTestId("note-editor").waitFor();
    await page.getByTestId("note-textarea").fill("The lamp is a metaphor.");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/note-editor-phone.png` });
    await page.keyboard.press("Escape");

    await revealChrome(page);
    await page.getByTestId("saved-btn").click();
    await page.getByTestId("saved-tab-words").click();
    await page.locator('[data-testid^="word-day-"]').first().waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/words-phone.png` });
    await page.getByTestId("saved-back").click();

    // Set the key in Settings (stubbed ping) and shoot the AI section.
    await revealChrome(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("gemini-key").fill("test-key");
    await page.getByTestId("gemini-test").click();
    await expect(page.getByTestId("gemini-test-result")).toContainText(
      "Key works",
    );
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${SHOTS}/ai-settings-phone.png`,
      fullPage: true,
    });
    await page.getByTestId("settings-back").click();

    // Ask sheet with an answer containing a tappable quote.
    await page.getByTestId("reader-root").waitFor();
    await revealChrome(page);
    await page.getByTestId("ask-btn").click();
    await page.getByTestId("ask-sheet").waitFor();
    await page.getByTestId("ask-input").fill("why did he take the poker?");
    await page.getByTestId("ask-send").click();
    await expect(page.getByTestId("ask-answer")).toContainText(
      "He took it for protection.",
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/ask-sheet-phone.png` });
  });
});
