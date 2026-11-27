import { expect, test } from "@playwright/test";
import { aloneInTheRoom, closeContexts, joinAs, MOVIE } from "./room";

test.afterEach(closeContexts);

test("the Activity Feed shows who did what, newest first", async ({ browser }) => {
  const ana = await joinAs(browser, "Ana");
  await aloneInTheRoom(ana);
  const rui = await joinAs(browser, "Rui"); // Rui is in before Ana acts
  // The single Room outlives earlier tests, so only the newest entries are this test's.
  const newest = rui.getByRole("list", { name: "Activity Feed" }).getByRole("listitem").first();

  await ana.getByLabel("Set a Local File").setInputFiles(MOVIE);
  await expect(newest).toContainText("Ana set movie.mp4");
  await expect(newest).toContainText(/\d{1,2}:\d{2}/); // a readable timestamp

  await ana.close();
  await expect(newest).toContainText("Ana left");
});
