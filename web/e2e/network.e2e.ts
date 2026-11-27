import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import path from "node:path";

const MOVIE = path.join(import.meta.dirname, "fixtures", "movie.mp4"); // 20 s
const THRESHOLD = 1;

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

/** Joins through a proxied socket that the test can cut, and keep down, at will. */
async function joinCuttable(browser: Browser, nickname: string) {
  const page = await (await browser.newContext()).newPage();
  const net = { down: false, socket: null as WebSocketRoute | null };
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (net.down) return ws.close();
    ws.connectToServer(); // forwards both ways untouched
    net.socket = ws;
  });
  await page.goto("/");
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: /In the Room/ })).toBeVisible();
  const cut = async () => {
    net.down = true;
    await net.socket?.close();
  };
  const restore = () => (net.down = false);
  return { page, cut, restore };
}

const video = (page: Page) => page.locator("video");
const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
const paused = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.paused);
const gap = async (a: Page, b: Page) => Math.abs((await time(a)) - (await time(b)));

test("a dropped Viewer reconnects on their own, with a badge meanwhile, and lands in sync", async ({ browser }) => {
  const { page: ana } = await joinCuttable(browser, "Ana");
  const { page: rui, cut, restore } = await joinCuttable(browser, "Rui");

  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await rui.getByLabel("Choose your copy of movie.mp4").setInputFiles(MOVIE);
  await video(ana).evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => paused(rui)).toBe(false);

  await cut();
  await expect(rui.getByRole("status")).toContainText("Reconnecting");
  await expect(ana.getByText("Rui · disconnected")).toBeVisible(); // held in place, not removed
  await video(ana).evaluate((v: HTMLVideoElement) => {
    v.currentTime = 10;
  });
  restore();

  await expect(rui.getByRole("status")).toBeHidden({ timeout: 10_000 });
  await expect(video(rui)).toBeVisible(); // kept their copy of the file
  await expect.poll(() => gap(ana, rui)).toBeLessThan(THRESHOLD);
  await expect(rui.getByText("Rui (you)")).toHaveCount(1); // the same presence entry, not a second Rui
});

test("when the media ends everyone stays paused at the end", async ({ browser }) => {
  const { page: ana } = await joinCuttable(browser, "Ana");
  const { page: rui } = await joinCuttable(browser, "Rui");
  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await rui.getByLabel("Choose your copy of movie.mp4").setInputFiles(MOVIE);
  await expect(video(rui)).toBeVisible();

  await video(ana).evaluate((v: HTMLVideoElement) => {
    v.currentTime = 18.5;
    return v.play();
  });
  for (const viewer of [ana, rui]) {
    await expect.poll(() => paused(viewer), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => time(viewer)).toBeGreaterThan(20 - THRESHOLD);
  }
  await ana.waitForTimeout(1500); // no flapping back into playing
  for (const viewer of [ana, rui]) expect(await paused(viewer)).toBe(true);
});
