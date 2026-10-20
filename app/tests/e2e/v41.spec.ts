import { test, expect, type Page } from "@playwright/test";

// v4.1: custom selection (no native toolbar), Gemini model discovery +
// dictionary fallback, and anchored-card clamping — all APIs stubbed
// (dictionaryapi.dev + generativelanguage), so the suite runs fully offline.
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

const MODELS_PAYLOAD = {
  models: [
    {
      name: "models/gemini-2.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.5-flash-preview",
      supportedGenerationMethods: ["generateContent"],
    },
  ],
};

const GEMINI_MEANING_JSON = JSON.stringify({
  definition: "A lamp made of brass.",
  inContext: "Here it is the one that burned out on the landing.",
});

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
}

async function stubApis(page: Page, dict: "ok" | "abort" = "ok") {
  await page.route("https://api.dictionaryapi.dev/**", async (route) => {
    if (dict === "abort") return route.abort();
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
      if (route.request().url().includes("/v1beta/models?")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MODELS_PAYLOAD),
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

/**
 * v4.1: select via a real long-press gesture — mouse down on the word,
 * held past the 450ms threshold, then dragged toward the end so phrases
 * extend. This exercises the custom selection path exactly as a finger
 * would (no native Selection is ever created).
 */
async function longPressSelect(page: Page, text: string) {
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

/** Walk to the brass-lamp sentence (the 2-part sentence). */
async function gotoBrassLamp(page: Page) {
  const current = page.getByTestId("current-item");
  for (let i = 0; i < 40 && !(await current.innerText()).includes("brass lamp"); i++)
    await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(450);
}

async function revealChrome(page: Page) {
  await page.waitForTimeout(450);
  const box = await page.getByTestId("stage").boundingBox();
  if (!box) throw new Error("stage has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
  await expect(page.getByTestId("top-bar")).toBeVisible();
}

test.describe("Lyric Reader v4.1 — custom selection", () => {
  test("long-press paints via CSS Highlights; native selection stays empty; Meaning opens the card", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await longPressSelect(page, "lamp");

    const painted = await page.evaluate(
      () => (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.has("lr-sel") ?? false,
    );
    expect(painted).toBe(true);
    const paintedText = await page.evaluate(() => {
      const set = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.get(
        "lr-sel",
      ) as Set<Range> | undefined;
      if (!set) return null;
      for (const r of set) return r.toString();
      return null;
    });
    expect(paintedText).toBe("lamp");
    // The native Selection is never created — Android's toolbar can't appear.
    const native = await page.evaluate(() => {
      const s = window.getSelection();
      return s ? s.isCollapsed : true;
    });
    expect(native).toBe(true);

    await expect(page.getByTestId("selection-pill")).toBeVisible();
    await page.getByTestId("sel-meaning").click();
    const card = page.getByTestId("meaning-card");
    await expect(card).toContainText("A device for giving light.");
  });

  test("drag after the long-press extends the selection to a phrase", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await longPressSelect(page, "brass lamp");
    const paintedText = await page.evaluate(() => {
      const set = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.get(
        "lr-sel",
      ) as Set<Range> | undefined;
      if (!set) return null;
      for (const r of set) return r.toString();
      return null;
    });
    expect(paintedText).toBe("brass lamp");
  });

  test("tap outside dismisses the custom selection", async ({ page }) => {
    await stubApis(page);
    await openSample(page);
    await gotoBrassLamp(page);
    await longPressSelect(page, "lamp");
    await expect(page.getByTestId("selection-pill")).toBeVisible();
    // Tap the top hot-zone (away from the pill): dismisses + reveals chrome.
    const box = await page.getByTestId("stage").boundingBox();
    if (!box) throw new Error("stage has no box");
    await page.mouse.click(box.x + box.width / 2, box.y + 40);
    await expect(page.getByTestId("selection-pill")).toHaveCount(0);
    const painted = await page.evaluate(
      () => (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.has("lr-sel") ?? false,
    );
    expect(painted).toBe(false);
  });
});

test.describe("Lyric Reader v4.1 — model discovery", () => {
  test("Test key discovers gemini-3.5-flash from the models list", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    await revealChrome(page);
    await page.getByTestId("settings-gear").click();
    await page.getByTestId("gemini-key").fill("test-key");
    await page.getByTestId("gemini-test").click();
    await expect(page.getByTestId("gemini-test-result")).toContainText(
      "Key works — using gemini-3.5-flash",
    );
    const stored = await page.evaluate(() =>
      localStorage.getItem("lr-gemini-model"),
    );
    expect(stored).toBe("gemini-3.5-flash");
  });
});

test.describe("Lyric Reader v4.1 — dictionary failure falls back to Gemini", () => {
  test("aborted dictionary still fills the meaning card via Gemini", async ({
    page,
  }) => {
    await stubApis(page, "abort");
    await openSample(page);
    // A key on the device: the fallback only fires when one exists.
    await page.evaluate(() =>
      localStorage.setItem("lr-gemini-key", "test-key"),
    );
    await gotoBrassLamp(page);
    await longPressSelect(page, "lamp");
    await page.getByTestId("sel-meaning").click();
    const card = page.getByTestId("meaning-card");
    await expect(card).toContainText("A lamp made of brass.");
    await expect(card).toContainText("In this sentence");
    await expect(card).toContainText("burned out on the landing");
  });
});

test.describe("Lyric Reader v4.1 — card clamping (FIX 3)", () => {
  test("note editor on a bottom sentence stays fully inside the viewport", async ({
    page,
  }) => {
    await stubApis(page);
    await openSample(page);
    // Step to the last item on the page (bottom of the screen).
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    // Double-tap the active part: opens the popup on any sentence shape.
    const box = await page
      .getByTestId("current-item")
      .locator('[data-p="0"]')
      .boundingBox();
    if (!box) throw new Error("part 0 has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // Single-part sentences open on the first tap; multi-part need the
    // double-tap (second tap still inside the 350ms double-tap window).
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
    if ((await page.getByTestId("popup-card").count()) === 0) {
      await page.mouse.click(x, y);
    }
    await page.getByTestId("popup-card").waitFor();
    await page.getByTestId("popup-note").click();
    await page.getByTestId("note-editor").waitFor();
    // Let the bundled webfonts arrive (they reflow card widths) and the
    // ResizeObserver re-clamp settle before measuring.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const card = await page.getByTestId("popup-card").boundingBox();
    if (!card) throw new Error("popup card has no box");
    const vw = 390;
    const vh = 844;
    expect(card.x).toBeGreaterThanOrEqual(12);
    expect(card.y).toBeGreaterThanOrEqual(12);
    expect(card.x + card.width).toBeLessThanOrEqual(vw - 12);
    expect(card.y + card.height).toBeLessThanOrEqual(vh - 12);

    // The Save button is fully visible and clickable.
    const save = await page.getByTestId("note-save").boundingBox();
    if (!save) throw new Error("note-save has no box");
    expect(save.x).toBeGreaterThanOrEqual(0);
    expect(save.x + save.width).toBeLessThanOrEqual(vw);
    expect(save.y + save.height).toBeLessThanOrEqual(vh);
    await expect(page.getByTestId("note-save")).toBeVisible();
    await page.getByTestId("note-textarea").fill("clamp test");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("popup-note")).toContainText("Edit note");
  });

  test("meaning card stays fully inside the viewport", async ({ page }) => {
    await stubApis(page);
    await openSample(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(450);
    await longPressSelect(page, await page.evaluate(() => {
      const el = document.querySelector('[data-testid="current-item"]');
      const t = (el?.textContent ?? "").trim().split(/\s+/)[0] ?? "";
      return t.replace(/[^\p{L}]/gu, "");
    }));
    await page.getByTestId("sel-meaning").click();
    const cardEl = page.getByTestId("meaning-card");
    await expect(cardEl).toBeVisible();
    // Let the bundled webfonts arrive (they reflow card widths) and the
    // ResizeObserver re-clamp settle before measuring.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const card = await cardEl.boundingBox();
    if (!card) throw new Error("meaning card has no box");
    const vw = 390;
    const vh = 844;
    expect(card.x).toBeGreaterThanOrEqual(12);
    expect(card.y).toBeGreaterThanOrEqual(12);
    expect(card.x + card.width).toBeLessThanOrEqual(vw - 12);
    expect(card.y + card.height).toBeLessThanOrEqual(vh - 12);
  });
});
