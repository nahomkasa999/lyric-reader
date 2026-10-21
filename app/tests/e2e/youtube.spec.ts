import { test, expect, type Page } from "@playwright/test";

// The YouTube → audio control (v4.11): it must sit at the bottom-left
// on the same level as the "?" / ▶ / speaker cluster, open sideways for
// a link, fold back into a circle when it plays, and open into a panel
// with the links you played before.
test.use({ viewport: { width: 390, height: 844 } });

/** A player that answers the way YouTube's embed does. */
const STUB = `<!doctype html><html><body><script>
  const info = {
    playerState: 1,
    currentTime: 3,
    duration: 100,
    volume: 55,
    videoData: { video_id: 'dQw4w9WgXcQ', title: 'Test track' },
  };
  const post = () =>
    parent.postMessage(JSON.stringify({ event: 'infoDelivery', id: 'ytp', info }), '*');
  window.addEventListener('message', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch { return; }
    if (d && d.event === 'listening') post();
  });
  post();
</script></body></html>`;

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("add-book-btn").waitFor();
  await page.locator('[data-testid^="open-book-"]').first().click();
  await page.getByTestId("current-item").waitFor();
}

/** Reveal the unified auto-hiding chrome (tap the top hot-zone). */
async function revealChrome(page: Page) {
  await page.waitForTimeout(450);
  const box = await page.getByTestId("stage").boundingBox();
  if (!box) throw new Error("stage has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.05);
  await expect(page.getByTestId("top-bar")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // The embed never leaves the phone in a test: it is answered here.
  await page.route(/youtube(-nocookie)?\.com\/embed/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: STUB,
    }),
  );
});

test.describe("Lyric Reader — YouTube to audio", () => {
  test("sits at the bottom-left, on the level of the other buttons", async ({
    page,
  }) => {
    await openSample(page);
    await revealChrome(page);

    const music = await page.getByTestId("yt-btn").boundingBox();
    const ask = await page.getByTestId("ask-btn").boundingBox();
    if (!music || !ask) throw new Error("the buttons have no box");

    // Same level (the bottom of the row), on the other side.
    expect(Math.abs(music.y - ask.y)).toBeLessThan(4);
    expect(music.x).toBeLessThan(ask.x);
  });

  test("opens sideways for a link, plays it, and folds back into a circle", async ({
    page,
  }) => {
    await openSample(page);
    await revealChrome(page);

    await page.getByTestId("yt-btn").click();
    await expect(page.getByTestId("yt-bar")).toBeVisible();
    await expect(page.getByTestId("yt-panel")).toHaveCount(0);

    await page
      .getByTestId("yt-input")
      .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByTestId("yt-play").click();

    // The bar is gone — the control is its circle again.
    await expect(page.getByTestId("yt-bar")).toHaveCount(0);
    await expect(page.getByTestId("yt-btn")).toBeVisible();

    // And the sound is a real player, off-screen.
    const frame = page.getByTestId("yt-frame");
    await expect(frame).toHaveCount(1);
    const src = await frame.getAttribute("src");
    expect(src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  test("the links you played show up in the panel, and play as a playlist", async ({
    page,
  }) => {
    await openSample(page);
    await revealChrome(page);

    await page.getByTestId("yt-btn").click();
    await page
      .getByTestId("yt-input")
      .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByTestId("yt-play").click();

    // The circle again → the panel opens.
    await page.getByTestId("yt-btn").click();
    await expect(page.getByTestId("yt-panel")).toBeVisible();
    await expect(page.getByTestId("yt-row-dQw4w9WgXcQ")).toBeVisible();
    await expect(page.getByTestId("yt-play-all")).toBeVisible();

    // The list plays as a playlist: the player is asked for the next one.
    await page.getByTestId("yt-play-all").click();
    await expect(page.getByTestId("yt-frame")).toHaveCount(1);
  });

  test("a link that is not a YouTube link says so", async ({ page }) => {
    await openSample(page);
    await revealChrome(page);

    await page.getByTestId("yt-btn").click();
    await page.getByTestId("yt-input").fill("not a link");
    await page.getByTestId("yt-play").click();

    await expect(page.getByTestId("yt-error")).toContainText(
      "doesn't look like a YouTube link",
    );
    await expect(page.getByTestId("yt-frame")).toHaveCount(0);
  });

  test("the panel holds the controls: pause, next, volume", async ({ page }) => {
    await openSample(page);
    await revealChrome(page);

    await page.getByTestId("yt-btn").click();
    await page
      .getByTestId("yt-input")
      .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByTestId("yt-play").click();
    await page.getByTestId("yt-btn").click();

    await expect(page.getByTestId("yt-toggle")).toBeVisible();
    await expect(page.getByTestId("yt-prev")).toBeVisible();
    await expect(page.getByTestId("yt-next")).toBeVisible();
    await expect(page.getByTestId("yt-volume")).toBeVisible();
    await expect(page.getByTestId("yt-panel-input")).toBeVisible();
  });
});
