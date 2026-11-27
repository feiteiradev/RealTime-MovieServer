import { expect, test, type Page } from "@playwright/test";
import { aloneInTheRoom, closeContexts, joinAs, MOVIE } from "./room";
import { readFileSync } from "node:fs";

test.afterEach(closeContexts);

const presence = (page: Page, text: string) =>
  page.getByRole("region", { name: /In the Room/ }).getByRole("listitem").filter({ hasText: text });

test("statuses show in the presence list, and a renamed copy warns without blocking", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana");
  await aloneInTheRoom(ana);
  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await expect(ana.locator("video")).toBeVisible();

  const rui = await joinAs(browser, "Rui");
  await expect(presence(ana, "Rui")).toHaveText("Rui · needs file");

  await rui.getByLabel("Choose your copy of movie.mp4").setInputFiles({
    name: "movie (1).mp4",
    mimeType: "video/mp4",
    buffer: readFileSync(MOVIE),
  });
  await expect(rui.getByRole("status")).toHaveText("Different name. You can keep watching anyway.");
  await expect(rui.locator("video")).toBeVisible();
  await expect(presence(ana, "Rui")).toHaveText("Rui · watching");
  await expect(presence(rui, "Ana")).toHaveText("Ana · watching");
});

test("a copy the browser can't decode says to try an MP4 copy", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana");
  await aloneInTheRoom(ana);
  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  const rui = await joinAs(browser, "Rui");

  await rui.getByLabel("Choose your copy of movie.mp4").setInputFiles({
    name: "movie.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not a video"),
  });
  await expect(rui.getByRole("alert")).toHaveText("Your browser can't play this file, try an MP4 copy");
});
