import { expect, test } from "@playwright/test";
import path from "node:path";

const MOVIE = path.join(import.meta.dirname, "fixtures", "movie.mp4");

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

test("the Activity Feed shows who did what, newest first", async ({ browser }) => {
  const join = async (nickname: string) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto("/");
    await page.getByLabel("Nickname").fill(nickname);
    await page.getByRole("button", { name: "Join" }).click();
    return page;
  };
  const ana = await join("Ana");
  const rui = await join("Rui");
  await expect(ana.getByRole("heading", { name: /In the Room/ })).toBeVisible();
  await expect(rui.getByRole("heading", { name: /In the Room/ })).toBeVisible(); // Rui is in before Ana acts
  // The single Room outlives earlier tests, so only the newest entries are this test's.
  const newest = rui.getByRole("list", { name: "Activity Feed" }).getByRole("listitem").first();

  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await expect(newest).toContainText("Ana set movie.mp4");
  await expect(newest).toContainText(/\d{1,2}:\d{2}/); // a readable timestamp

  await ana.close();
  await expect(newest).toContainText("Ana left");
});
