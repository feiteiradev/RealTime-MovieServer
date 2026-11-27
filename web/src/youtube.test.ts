import { describe, expect, test } from "bun:test";
import { parseYouTubeLink, seekedByUser, youtubeErrorMessage } from "./youtube";

describe("parseYouTubeLink", () => {
  test.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc&t=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/aB3_-xYz012", "aB3_-xYz012"],
    ["  youtube.com/shorts/aB3_-xYz012?feature=share ", "aB3_-xYz012"],
    ["youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s → %s", (link, id) => {
    expect(parseYouTubeLink(link)).toBe(id);
  });

  test.each([
    "",
    "not a link",
    "dQw4w9WgXcQ",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQQ",
    "https://www.youtube.com/channel/UCxyz",
    "https://youtu.be/",
    "https://evil.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "javascript://youtube.com/watch?v=dQw4w9WgXcQ",
  ])("rejects %p", (link) => {
    expect(parseYouTubeLink(link)).toBeNull();
  });
});

describe("youtubeErrorMessage", () => {
  test("names each embed failure", () => {
    expect(youtubeErrorMessage(100)).toMatch(/not found or private/);
    expect(youtubeErrorMessage(101)).toMatch(/disabled embedding/);
    expect(youtubeErrorMessage(150)).toMatch(/disabled embedding/);
    expect(youtubeErrorMessage(153)).toMatch(/referrer/);
    expect(youtubeErrorMessage(5)).toMatch(/error 5/);
  });
});

describe("seekedByUser", () => {
  const last = { time: 10, at: 1_000 };
  test("steady playback is not a seek", () => {
    expect(seekedByUser(last, { time: 10.25, at: 1_250 }, true, 1)).toBe(false);
    expect(seekedByUser(last, { time: 10.5, at: 1_250 }, true, 2)).toBe(false);
  });
  test("paused time standing still is not a seek", () => {
    expect(seekedByUser(last, { time: 10, at: 5_000 }, false, 1)).toBe(false);
  });
  test("a jump forward or back is", () => {
    expect(seekedByUser(last, { time: 60, at: 1_250 }, true, 1)).toBe(true);
    expect(seekedByUser(last, { time: 3, at: 1_250 }, false, 1)).toBe(true);
  });
});
