import { expect, test } from "bun:test";
import { describeEntry } from "./feed";

const at = 0;

test("describes each action with the Viewer's Nickname and, where relevant, the position", () => {
  expect(describeEntry({ at, nickname: "Jo", action: "join" })).toBe("Jo joined");
  expect(describeEntry({ at, nickname: "Jo", action: "leave" })).toBe("Jo left");
  expect(describeEntry({ at, nickname: "Ana", action: "pause", position: 724.9 })).toBe("Ana paused at 12:04");
  expect(describeEntry({ at, nickname: "Rui", action: "play", position: 0 })).toBe("Rui played from 0:00");
  expect(describeEntry({ at, nickname: "Rui", action: "seek", position: 2710 })).toBe("Rui jumped to 45:10");
  expect(describeEntry({ at, nickname: "Rui", action: "seek", position: 3725 })).toBe("Rui jumped to 1:02:05");
  expect(
    describeEntry({ at, nickname: "Mia", action: "setMedia", mediaItem: { source: "local", name: "Movie.mkv", size: 1, duration: 1 } }),
  ).toBe("Mia set Movie.mkv");
  expect(describeEntry({ at, nickname: "Ana", action: "rate", rate: 1.5 })).toBe("Ana set speed to 1.5×");
});
