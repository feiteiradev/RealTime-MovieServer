import { expect, type Page } from "@playwright/test";

/**
 * Waits until the test's first Viewer is alone in the Room. The single Room outlives each
 * test, and the previous test's Viewers leave a moment after their contexts close.
 */
export async function aloneInTheRoom(page: Page) {
  await expect(page.getByRole("heading", { name: "In the Room (1)" })).toBeVisible();
}
