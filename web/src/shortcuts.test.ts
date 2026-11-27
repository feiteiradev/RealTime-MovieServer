import { describe, expect, test } from "bun:test";
import { shortcut } from "./TransportControls";

const body = { tagName: "BODY", isContentEditable: false };

describe("shortcut", () => {
  test("maps the keys", () => {
    expect(shortcut(" ", body)).toBe("toggle");
    expect(shortcut("ArrowLeft", body)).toBe("back");
    expect(shortcut("ArrowRight", body)).toBe("forward");
    expect(shortcut("ArrowUp", body)).toBe("louder");
    expect(shortcut("ArrowDown", body)).toBe("quieter");
    expect(shortcut("a", body)).toBeNull();
  });

  test("does nothing while typing", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(shortcut(" ", { tagName, isContentEditable: false })).toBeNull();
    expect(shortcut("ArrowLeft", { tagName: "DIV", isContentEditable: true })).toBeNull();
  });

  test("Space on a focused button or link presses it instead", () => {
    for (const tagName of ["BUTTON", "A"]) {
      expect(shortcut(" ", { tagName, isContentEditable: false })).toBeNull();
      expect(shortcut("ArrowRight", { tagName, isContentEditable: false })).toBe("forward");
    }
    expect(shortcut(" ", { tagName: "DIV", isContentEditable: false, role: "button" })).toBeNull();
  });
});
