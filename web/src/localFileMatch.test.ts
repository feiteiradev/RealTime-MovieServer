import { describe, expect, test } from "bun:test";
import { matchLocalFile } from "./localFileMatch";

const set = { source: "local", name: "movie.mp4", size: 1234, duration: 600 } as const;
const copy = (c: Partial<{ name: string; size: number; duration: number }>) => ({ ...set, ...c });

describe("matchLocalFile", () => {
  test("the same name, size and length is the same file", () => {
    expect(matchLocalFile(set, copy({}))).toBe("same");
  });

  test("under a second of length difference still counts as the same", () => {
    expect(matchLocalFile(set, copy({ duration: 600.4 }))).toBe("same");
  });

  test("a shorter copy says by how many minutes", () => {
    expect(matchLocalFile(set, copy({ duration: 420 }))).toBe("Your copy is 3 min shorter");
  });

  test("a longer copy by under a minute says seconds", () => {
    expect(matchLocalFile(set, copy({ duration: 612 }))).toBe("Your copy is 12 s longer");
  });

  test("a different size", () => {
    expect(matchLocalFile(set, copy({ size: 999 }))).toBe("Different file size");
  });

  test("a different name", () => {
    expect(matchLocalFile(set, copy({ name: "Movie (1).mp4" }))).toBe("Different name");
  });

  test("several differences are all listed, length first", () => {
    expect(matchLocalFile(set, { name: "other.mkv", size: 5, duration: 300 })).toBe(
      "Your copy is 5 min shorter, different file size, different name",
    );
  });
});

test("an unreadable copy length doesn't produce a length warning", () => {
  const set = { source: "local" as const, name: "a.webm", size: 10, duration: 100 };
  expect(matchLocalFile(set, { name: "a.webm", size: 10, duration: Infinity })).toBe("same");
});
