import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

// 20 s, 160×90 VP9 in MP4 (Playwright's Chromium has no H.264), a keyframe every second.
export const MOVIE = path.join(import.meta.dirname, "fixtures", "movie.mp4");
export const THRESHOLD = 1; // seconds of Drift the Room tolerates

/** For test.afterEach: each Viewer has its own browser context; closing them makes them leave before the next test. */
export async function closeContexts({ browser }: { browser: Browser }) {
  await Promise.all(browser.contexts().map((c: BrowserContext) => c.close()));
}

/** Joins the Room on page as nickname. */
export async function join(page: Page, nickname: string) {
  await page.goto("/");
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: /In the Room/ })).toBeVisible();
}

/** A new Viewer in their own browser context, joined as nickname. */
export async function joinAs(browser: Browser, nickname: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await join(page, nickname);
  return page;
}

/**
 * Waits until the test's first Viewer is alone in the Room. The single Room outlives each
 * test, and the previous test's Viewers leave a moment after their contexts close.
 */
export async function aloneInTheRoom(page: Page) {
  await expect(page.getByRole("heading", { name: "In the Room (1)" })).toBeVisible();
}

export const video = (page: Page) => page.locator("video");
export const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
export const paused = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.paused);
export const gap = async (a: Page, b: Page) => Math.abs((await time(a)) - (await time(b)));
