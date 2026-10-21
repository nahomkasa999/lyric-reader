import { test, expect, type Page } from "@playwright/test";

// The assistant (v4.12): it must answer from the reader's own books —
// from ANY book, not just the page that is open — and it must never
// grow a thread without bound: a new thread starts empty.
test.use({ viewport: { width: 390, height: 844 } });

/** A passage of the sample book, as the knowledge base would hold it. */
const PASSAGE = {
  id: "sample:0",
  bookId: "sample",
  text:
    "Dr. Abernathy, the locksmith on Marlowe Street, had promised to come " +
    "on Tuesday. It was now Friday, and the rain had other plans for everyone.",
  heading: "What He Knew",
  page: 2,
  from: 12,
  to: 13,
};

const ANSWER =
  "The locksmith was on Marlowe Street — «Dr. Abernathy, the locksmith on " +
  "Marlowe Street, had promised to come on Tuesday.»";

/** The Gemini API, stubbed: embeddings and answers. */
async function stubGemini(page: Page) {
  await page.route(/generativelanguage\.googleapis\.com/, async (route) => {
    const req = route.request();
    const body = (() => {
      try {
        return JSON.parse(req.postData() ?? "{}");
      } catch {
        return {};
      }
    })();
    if (req.url().includes(":embedContent")) {
      const parts = body?.content?.parts ?? [];
      const n = Array.isArray(parts) && parts.length ? parts.length : 1;
      const embeddings = Array.from({ length: n }, () => ({
        values: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0.01)),
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ embeddings }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: ANSWER }] } }],
      }),
    });
  });
}

/** Put one passage (and its vector) into the knowledge base. */
async function seedIndex(page: Page) {
  // The service worker takes control and reloads the page the first
  // time — the seeding waits for that to be over.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.evaluate(async (passage) => {
        const open = indexedDB.open("lyric-reader", 4);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
          open.onupgradeneeded = () => {
            const d = open.result;
            if (!d.objectStoreNames.contains("chunks"))
              d.createObjectStore("chunks", { keyPath: "id" });
            if (!d.objectStoreNames.contains("vectors"))
              d.createObjectStore("vectors", { keyPath: "id" });
          };
        });
        await new Promise<void>((resolve, reject) => {
          const t = db.transaction(["chunks", "vectors"], "readwrite");
          t.objectStore("chunks").put(passage);
          t.objectStore("vectors").put({
            id: passage.id,
            v: new Float32Array(768).fill(0.01),
            w: [
              "abernathy",
              "locksmith",
              "marlowe",
              "street",
              "promised",
              "tuesday",
              "friday",
              "rain",
              "plans",
              "everyone",
            ],
          });
          t.oncomplete = () => {
            db.close();
            resolve();
          };
          t.onerror = () => {
            db.close();
            reject(t.error);
          };
        });
      }, PASSAGE);
      return;
    } catch {
      await page.waitForTimeout(600);
    }
  }
  throw new Error("the knowledge base could not be seeded");
}

test.beforeEach(async ({ page }) => {
  // A key of the reader's own — the API calls are stubbed below.
  await page.addInitScript(() => {
    window.localStorage.setItem("lr-gemini-key", "test-personal-key-0001");
  });
  await stubGemini(page);
});

test.describe("Lyric Reader — the assistant", () => {
  test("answers from the library, with the page it is on", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("add-book-btn").waitFor();
    await seedIndex(page);

    await page.getByTestId("library-assistant-btn").click();
    await expect(page.getByTestId("assistant-sheet")).toBeVisible();

    await page
      .getByTestId("assistant-input")
      .fill("which street is the locksmith on");
    await page.getByTestId("assistant-send").click();

    await expect(page.getByTestId("assistant-answer")).toBeVisible({
      timeout: 15000,
    });
    // The answer says where it came from.
    await expect(page.getByTestId("assistant-sources")).toBeVisible();
    await expect(page.getByTestId("assistant-source-0")).toContainText("p.2");
  });

  test("a new thread starts empty", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("add-book-btn").waitFor();
    await seedIndex(page);

    await page.getByTestId("library-assistant-btn").click();
    await page
      .getByTestId("assistant-input")
      .fill("which street is the locksmith on");
    await page.getByTestId("assistant-send").click();
    await expect(page.getByTestId("assistant-answer")).toBeVisible({
      timeout: 15000,
    });

    // The thread has the answer…
    await expect(page.getByTestId("assistant-question")).toHaveCount(1);

    // …and a new one starts from nothing.
    await page.getByTestId("assistant-new-thread").click();
    await expect(page.getByTestId("assistant-question")).toHaveCount(0);
    await expect(page.getByTestId("assistant-answer")).toHaveCount(0);
  });

  test("the reader's menu opens it too", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("add-book-btn").waitFor();
    await page.locator('[data-testid^="open-book-"]').first().click();
    await page.getByTestId("current-item").waitFor();

    await page.waitForTimeout(450);
    const box = await page.getByTestId("stage").boundingBox();
    if (!box) throw new Error("stage has no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
    await page.getByTestId("reader-menu-btn").click();
    await page.getByTestId("assistant-btn").click();
    await expect(page.getByTestId("assistant-sheet")).toBeVisible();
  });
});
