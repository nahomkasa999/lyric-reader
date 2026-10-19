import { test, expect, type Page } from "@playwright/test";

// v4: selection + Meaning + Words, and the Ask (?) feature — with BOTH
// network APIs stubbed (dictionaryapi.dev + generativelanguage), so the
// whole suite runs fully offline.
test.use({ viewport: { width: 390, height: 844 } });

const DICT_ENTRY = {
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
};

const GEMINI_MEANING_JSON = JSON.stringify({
  definition: "A lamp made of brass.",
  inContext: "Here it is the one that burned out on the landing.",
});

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("upload-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
}

async function stubApis(page: Page) {
  await page.route("https://api.dictionaryapi.dev/**", async (route) => {
    const word = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    if (word === "lamp") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([DICT_ENTRY]),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ title: "No Definitions Found" }),
    });
  });
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
      const text = body?.contents
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
      if (body?.generationConfig?.responseMimeType === "application/json")
        return answer(GEMINI_MEANING_JSON);
      if (/Reply with exactly/i.test(text)) return answer("ok");
      return answer(
        "He took it for protection. «Take the poker from the study.»",
      );
    },
  );
}

/** Walk to the brass-lamp sentence (item 10, the 2-part sentence). */
async function gotoBrassLamp(page: Page) {
  const current = page.getByTestId("current-item");
  for (let i = 0; i < 40 && !(await current.innerText()).includes("brass lamp"); i++)
    await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(450);
}

/**
 * v4.1: select via a real long-press gesture — mouse down on the word,
 * held past the 450ms threshold, then dragged toward the end so phrases
 * extend. This exercises the custom selection path exactly as a finger
 * would (no native Selection is ever created).
 */
async function selectText(page: Page, text: string) {
  const pt = await page.evaluate((t) => {
    const el = document.querySelector('[data-testid="current-item"]');
    if (!el) throw new Error("no current item");
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null = null;
    let found: { node: Node; idx: number } | null = null;
    while ((node = walker.nextNode())) {
      const idx = (node.textContent ?? "")
        .toLowerCase()
        .indexOf(t.toLowerCase());
      if (idx >= 0) {
        found = { node, idx };
        break;
      }
    }
    if (!found) throw new Error(`"${t}" not found in current item`);
    const range = document.createRange();
    range.setStart(found.node, found.idx);
    range.setEnd(found.node, found.idx + t.length);
    const rect = range.getBoundingClientRect();
    return {
      sx: rect.left + 6,
      ex: rect.right - 6,
      y: rect.top + rect.height / 2,
    };
  }, text);
  await page.mouse.move(pt.sx, pt.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.move(pt.ex, pt.y, { steps: 12 });
  await page.mouse.up();
  await page.getByTestId("selection-pill").waitFor();
}

async function revealChrome(page: Page) {
  await page.waitForTimeout(450);
  const box = await page.getByTestId("stage").boundingBox();
  if (!box) throw new Error("stage has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
  await expect(page.getByTestId("top-bar")).toBeVisible();
}

test.describe("Lyric Reader v4 — selection and Meaning", () => {
  test("selecting a word raises the pill; Meaning opens the card", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "lamp");
    const pill = page.getByTestId("selection-pill");
    await expect(pill).toBeVisible();
    await expect(page.getByTestId("sel-meaning")).toContainText("Meaning");
    await page.getByTestId("sel-meaning").click();
    const card = page.getByTestId("meaning-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("A device for giving light.");
    await expect(card).toContainText("/læmp/");
    await expect(card).toContainText("noun");
  });

  test("stepping input is suppressed while a selection is active", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "lamp");
    const before = await page.getByTestId("current-item").innerText();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    expect(await page.getByTestId("current-item").innerText()).toBe(before);
    // Escape collapses the selection and frees input again.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selection-pill")).toBeHidden();
  });

  test("tapping elsewhere collapses the selection without stepping", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "lamp");
    const before = await page.getByTestId("current-item").innerText();
    await page.mouse.click(30, 300);
    await expect(page.getByTestId("selection-pill")).toBeHidden();
    expect(await page.getByTestId("current-item").innerText()).toBe(before);
  });

  test("copy writes the selected text and closes the pill", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "lamp");
    await page.getByTestId("sel-copy").click();
    await expect(page.getByTestId("selection-pill")).toBeHidden();
    const clipped = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipped).toBe("lamp");
  });

  test("saving a word underlines it and persists across reload", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "lamp");
    await page.getByTestId("sel-meaning").click();
    await page.getByTestId("meaning-save").click();
    await expect(page.getByTestId("meaning-save")).toContainText("Saved");
    // The saved word gets the dotted underline on the page.
    await expect(
      page.getByTestId("current-item").locator(".voc"),
    ).not.toHaveCount(0);
    await page.getByTestId("meaning-close").click();
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByTestId("current-item").waitFor();
    await expect(
      page.getByTestId("current-item").locator(".voc"),
    ).not.toHaveCount(0);
  });

  test("a phrase without a key explains the key path; with a key Gemini defines it", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "brass lamp");
    await page.getByTestId("sel-meaning").click();
    const card = page.getByTestId("meaning-card");
    await expect(card).toContainText("Phrases need the AI");
    await page.getByTestId("meaning-close").click();

    // Add a key in Settings, then the phrase resolves via Gemini.
    await revealChrome(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("gemini-key").fill("test-key");
    await page.getByTestId("gemini-test").click();
    await expect(page.getByTestId("gemini-test-result")).toContainText(
      "Key works — using gemini-3.5-flash",
    );
    await page.getByTestId("settings-back").click();
    await page.getByTestId("current-item").waitFor();
    // The remounted reader's track animates (.35s) to the restored
    // position — measuring the word rect mid-flight yields a stale point.
    await page.waitForTimeout(600);
    await selectText(page, "brass lamp");
    await page.getByTestId("sel-meaning").click();
    await expect(card).toContainText("A lamp made of brass.");
    await expect(card).toContainText("In this sentence");
    await expect(card).toContainText("burned out on the landing");
  });
});

test.describe("Lyric Reader v4 — Words view", () => {
  async function saveLampWord(page: Page) {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await selectText(page, "lamp");
    await page.getByTestId("sel-meaning").click();
    await page.getByTestId("meaning-save").click();
    await page.getByTestId("meaning-close").click();
  }

  test("saved words group under Today; tapping jumps to the sentence", async ({
    page,
  }) => {
    await saveLampWord(page);
    await revealChrome(page);
    await page.getByTestId("saved-btn").click();
    await page.getByTestId("saved-tab-words").click();
    await expect(page.getByTestId("words-empty")).toBeHidden();
    const group = page.locator('[data-testid^="word-day-"]').first();
    await expect(group).toContainText("Today");
    await expect(group).toContainText("1 word");
    const row = page.locator('[data-testid^="word-row-"]').first();
    await expect(row).toContainText("lamp");
    await expect(row).toContainText("A device for giving light.");
    // Tapping the row lands the reader on that exact sentence.
    await row.click();
    const current = page.getByTestId("current-item");
    await current.waitFor();
    await expect(current).toContainText("brass lamp");
  });

  test("deleting a word removes it and its underline", async ({ page }) => {
    await saveLampWord(page);
    await revealChrome(page);
    await page.getByTestId("saved-btn").click();
    await page.getByTestId("saved-tab-words").click();
    const del = page.locator('[data-testid^="word-del-"]').first();
    await del.click();
    await expect(page.getByTestId("words-empty")).toBeVisible();
    await page.getByTestId("saved-back").click();
    await expect(
      page.getByTestId("current-item").locator(".voc"),
    ).toHaveCount(0);
  });

  test("words empty state is calm", async ({ page }) => {
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("saved-btn").click();
    await page.getByTestId("saved-tab-words").click();
    await expect(page.getByTestId("words-empty")).toContainText(
      "No words saved yet",
    );
  });
});

test.describe("Lyric Reader v4 — Ask (?)", () => {
  test("the ? button hides and shows with the chrome", async ({ page }) => {
    await openSample(page);
    const ask = page.getByTestId("ask-btn");
    await expect(ask).toBeHidden();
    await revealChrome(page);
    await expect(ask).toBeVisible();
  });

  test("without a key the sheet explains how to switch the AI on", async ({
    page,
  }) => {
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("ask-btn").click();
    await expect(page.getByTestId("ask-sheet")).toBeVisible();
    await expect(page.getByTestId("ask-nokey")).toContainText("Gemini key");
    await page.getByTestId("ask-to-settings").click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByTestId("gemini-key")).toBeVisible();
  });

  test("asking renders the answer; a «quote» tap jumps to the sentence", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("gemini-key").fill("test-key");
    await page.getByTestId("settings-back").click();
    await page.getByTestId("current-item").waitFor();
    await revealChrome(page);
    await page.getByTestId("ask-btn").click();
    const sheet = page.getByTestId("ask-sheet");
    await expect(page.getByTestId("ask-context-chip")).toContainText(/Page 1/);
    await page.getByTestId("ask-input").fill("why did he take the poker?");
    await page.getByTestId("ask-send").click();
    const answer = page.getByTestId("ask-answer");
    await expect(answer).toContainText("He took it for protection.");
    // The quoted sentence is tappable and jumps the reader there.
    await page.locator('[data-testid^="ask-quote-"]').first().click();
    await expect(page.getByTestId("ask-sheet")).toBeHidden();
    await expect(page.getByTestId("current-item")).toContainText(
      "Take the poker",
    );
  });

  test("follow-ups keep the thread and it persists across reload", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("gemini-key").fill("test-key");
    await page.getByTestId("settings-back").click();
    await page.getByTestId("current-item").waitFor();
    await revealChrome(page);
    await page.getByTestId("ask-btn").click();
    await page.getByTestId("ask-input").fill("first question");
    await page.getByTestId("ask-send").click();
    await expect(page.getByTestId("ask-answer")).toBeVisible();
    await page.getByTestId("ask-input").fill("second question");
    await page.getByTestId("ask-send").click();
    await expect(page.locator('[data-testid="ask-question"]')).toHaveCount(2);
    await page.getByTestId("ask-close").click();
    await page.reload();
    await page.getByTestId("current-item").waitFor();
    await revealChrome(page);
    await page.getByTestId("ask-btn").click();
    await expect(
      page.locator('[data-testid="ask-question"]').first(),
    ).toContainText("first question");
  });
});
