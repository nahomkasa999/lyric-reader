import { test, expect } from "@playwright/test";

// Regression: a book stored by an older app with a MERGED paragraph item
// (the quote-boundary segmentation bug) is re-segmented on open.
test.use({ viewport: { width: 390, height: 844 } });

const MERGED =
  "But first we have to define a term I use throughout this book: “dream client.” A dream client is the prospective client for whom you can create breathtaking, jaw-dropping, earth-shattering value and who allows you to keep some of the value that you create (something you know as “profit”).";

async function seedMergedBook(page: import("@playwright/test").Page) {
  await page.context().addInitScript(
    (text: string) => {
      const open = indexedDB.open("lyric-reader", 3);
      open.onupgradeneeded = () => {
        const db = open.result;
        const withKey = (n: string, kp: string) =>
          db.objectStoreNames.contains(n)
            ? undefined
            : db.createObjectStore(n, { keyPath: kp });
        withKey("books", "id");
        withKey("marks", "id");
        withKey("vocab", "id");
        withKey("ask", "bookId");
        if (!db.objectStoreNames.contains("progress"))
          db.createObjectStore("progress");
      };
      open.onsuccess = () => {
        const db = open.result;
        const t = db.transaction("books", "readwrite");
        t.objectStore("books").put({
          id: "heal-book",
          title: "Heal Book",
          items: [
            {
              kind: "para",
              depth: 0,
              text,
              page: 0,
              paraStart: true,
            },
          ],
          totalSentences: 1,
          createdAt: Date.now(),
          source: "upload",
        });
      };
    },
    MERGED,
  );
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.getByTestId("open-book-heal-book").click();
  await page.getByTestId("current-item").waitFor();
}

test("stored merged item is re-segmented on open and parted", async ({
  page,
}) => {
  await seedMergedBook(page);
  const current = page.getByTestId("current-item");
  // Item 0: only the first sentence.
  await expect(current).toContainText("dream client.”");
  await expect(current).not.toContainText("A dream client is the prospective");
  // Item 1 exists (the second sentence) with parted text.
  const second = page.getByTestId("item-1");
  await expect(second).toContainText("A dream client is the prospective");
  // Advance to the second item: it is long, so it has 2+ parts.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("current-item")).toContainText(
    "A dream client is the prospective",
  );
  const parts = page.getByTestId("current-item").locator(".pt");
  await expect(parts.count()).resolves.toBeGreaterThan(1);
  // Only the current part is bright.
  await expect(parts.nth(0)).toHaveClass(/on/);
  await expect(parts.nth(1)).not.toHaveClass(/on/);
});
