import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";

// 20 s, 160×90 VP9 in MP4 (Playwright's Chromium has no H.264), a keyframe every second.
const MOVIE = path.join(import.meta.dirname, "fixtures", "movie.mp4");
const THRESHOLD = 1; // seconds of Drift the Room tolerates

// Each Viewer gets its own browser context; close them so they leave the Room before the next test.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

async function joinAs(browser: Browser, nickname: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: /In the Room/ })).toBeVisible();
  return page;
}

const video = (page: Page) => page.locator("video");
const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
const paused = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.paused);
const rate = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.playbackRate);
const gap = async (a: Page, b: Page) => Math.abs((await time(a)) - (await time(b)));

// The Viewer's own actions go straight to the <video>, as its native controls would.
const userPlay = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.play());
const userPause = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.pause());
const userSeek = (page: Page, to: number) =>
  video(page).evaluate((v: HTMLVideoElement, t) => {
    v.currentTime = t;
  }, to);

test("Viewers watch a Local File together: play, seek and pause follow, late joiners land in sync", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana");
  const rui = await joinAs(browser, "Rui");

  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await rui.getByLabel("Choose your copy of movie.mp4").setInputFiles(MOVIE);
  await expect(video(ana)).toBeVisible();
  await expect(video(rui)).toBeVisible();

  await userPlay(ana);
  await expect.poll(() => paused(rui)).toBe(false);
  await expect.poll(() => gap(ana, rui)).toBeLessThan(THRESHOLD);

  await userSeek(rui, 12);
  await expect.poll(() => time(ana)).toBeGreaterThanOrEqual(12 - THRESHOLD);
  await expect.poll(() => gap(ana, rui)).toBeLessThan(THRESHOLD);
  expect(await paused(ana)).toBe(false);

  await rui.getByLabel("Speed").selectOption("1.5");
  await expect.poll(() => rate(ana)).toBe(1.5);
  await expect(ana.getByLabel("Speed")).toHaveValue("1.5");
  await expect.poll(() => gap(ana, rui)).toBeLessThan(THRESHOLD);

  // A late joiner sees the prompt while the Room keeps playing, then lands in sync.
  const mia = await joinAs(browser, "Mia");
  await expect(mia.getByText("Choose your copy of movie.mp4")).toBeVisible();
  expect(await paused(ana)).toBe(false);
  await mia.getByLabel("Choose your copy of movie.mp4").setInputFiles(MOVIE);
  await expect.poll(() => paused(mia)).toBe(false);
  await expect.poll(() => rate(mia)).toBe(1.5);
  await expect.poll(() => gap(ana, mia)).toBeLessThan(THRESHOLD);

  await userPause(ana);
  for (const viewer of [rui, mia]) {
    await expect.poll(() => paused(viewer)).toBe(true);
    await expect.poll(() => gap(ana, viewer)).toBeLessThan(THRESHOLD);
  }

  // Nobody's player drifts back into playing: the Room's changes didn't echo as new commands.
  await ana.waitForTimeout(1000);
  for (const viewer of [ana, rui, mia]) expect(await paused(viewer)).toBe(true);
});

test("a YouTube link replaces the Media Item for everyone; an invalid one is refused before sending", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana");
  const rui = await joinAs(browser, "Rui");
  // Offline and deterministic: the real IFrame API is checked by hand.
  for (const p of [ana, rui]) await p.route("https://www.youtube.com/**", (r) => r.abort());

  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await expect(rui.getByText("Choose your copy of movie.mp4")).toBeVisible();

  await ana.getByLabel("Set a YouTube link").fill("https://vimeo.com/123");
  await ana.getByRole("button", { name: "Play" }).click();
  await expect(ana.getByRole("alert")).toHaveText("That's not a valid YouTube link");
  await expect(rui.getByText("Choose your copy of movie.mp4")).toBeVisible();

  await ana.getByLabel("Set a YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
  await ana.getByRole("button", { name: "Play" }).click();
  await expect(rui.getByText("Choose your copy of movie.mp4")).toBeHidden();
  await expect(rui.getByRole("alert")).toHaveText("Couldn't reach YouTube; check your connection");
});

test("±10 s and shortcuts apply to everyone; volume stays personal", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana");
  const rui = await joinAs(browser, "Rui");
  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await rui.getByLabel("Choose your copy of movie.mp4").setInputFiles(MOVIE);
  await expect(video(rui)).toBeVisible();

  await ana.getByRole("button", { name: "Forward 10 seconds" }).click();
  await expect.poll(() => time(rui)).toBeCloseTo(10, 0);
  await ana.getByRole("button", { name: "Forward 10 seconds" }).click();
  await expect.poll(() => time(rui)).toBeCloseTo(20, 0); // clamped to the 20 s fixture
  await rui.keyboard.press("ArrowLeft");
  await expect.poll(() => time(ana)).toBeCloseTo(10, 0);

  await rui.keyboard.press("Space");
  await expect.poll(() => paused(ana)).toBe(false);
  await ana.keyboard.press("Space");
  await expect.poll(() => paused(rui)).toBe(true);

  await ana.keyboard.press("ArrowDown");
  await ana.getByRole("checkbox", { name: "Mute" }).check();
  const volume = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => [v.volume, v.muted]);
  await expect.poll(() => volume(ana)).toEqual([0.9, true]);
  await rui.waitForTimeout(500);
  expect(await volume(rui)).toEqual([1, false]);
});
