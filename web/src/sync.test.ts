import { describe, expect, test } from "bun:test";
import { addClockSample, bestClockSample, CLOCK_SAMPLES, clockSample, decideDrift, expectedPosition, follow } from "./sync";
import type { Player } from "./player/player";
import type { PlaybackState } from "./protocol";

const movie = { source: "local", name: "movie.mp4", size: 1234, duration: 600 } as const;

function state(s: Partial<PlaybackState>): PlaybackState {
  return { mediaItem: movie, playing: false, position: 0, rate: 1, updatedAt: 10_000, ...s };
}

describe("expectedPosition", () => {
  test("paused stays where it was set", () => {
    expect(expectedPosition(state({ position: 42 }), 99_000)).toBe(42);
  });

  test("playing advances with server time", () => {
    expect(expectedPosition(state({ playing: true, position: 42 }), 13_500)).toBe(45.5);
  });

  test("playing at 2x advances twice as fast", () => {
    expect(expectedPosition(state({ playing: true, position: 42, rate: 2 }), 13_000)).toBe(48);
  });
});

describe("decideDrift", () => {
  test("paused: under 1 second of Drift is left alone", () => {
    expect(decideDrift(state({ position: 30 }), 0, 50_000, 30.9)).toEqual({ action: "leave" });
  });

  test("paused: 1 second of Drift jumps to the position", () => {
    expect(decideDrift(state({ position: 30 }), 0, 50_000, 31)).toEqual({ action: "jump", to: 30 });
  });

  test("playing: behind by 1 second or more jumps to the expected position", () => {
    // 2 s after updatedAt at 1x → expected 12; player shows 10.5.
    expect(decideDrift(state({ playing: true, position: 10 }), 0, 12_000, 10.5)).toEqual({ action: "jump", to: 12 });
  });

  test("playing: just under 1 second ahead is left alone", () => {
    expect(decideDrift(state({ playing: true, position: 10 }), 0, 12_000, 12.99)).toEqual({ action: "leave" });
  });

  test("playing at 1.5x uses the rate", () => {
    // 4 s at 1.5x → expected 16.
    expect(decideDrift(state({ playing: true, position: 10, rate: 1.5 }), 0, 14_000, 14)).toEqual({ action: "jump", to: 16 });
    expect(decideDrift(state({ playing: true, position: 10, rate: 1.5 }), 0, 14_000, 15.5)).toEqual({ action: "leave" });
  });

  test("playing at 0.5x uses the rate", () => {
    // 4 s at 0.5x → expected 12.
    expect(decideDrift(state({ playing: true, position: 10, rate: 0.5 }), 0, 14_000, 13.5)).toEqual({ action: "jump", to: 12 });
  });

  test("clock offset converts local time to server time", () => {
    // Local clock is 3 s behind the server: local 9_000 is server 12_000 → expected 12.
    expect(decideDrift(state({ playing: true, position: 10 }), 3_000, 9_000, 12.2)).toEqual({ action: "leave" });
    expect(decideDrift(state({ playing: true, position: 10 }), 3_000, 9_000, 10)).toEqual({ action: "jump", to: 12 });
  });

  test("no Media Item: nothing to correct", () => {
    expect(decideDrift(state({ mediaItem: null, position: 30 }), 0, 50_000, 0)).toEqual({ action: "leave" });
  });
});

describe("clock offset", () => {
  test("a sample assumes the server answered halfway through the round trip", () => {
    // Sent at local 1_000, received at local 1_200, server said 5_100 → offset 4_000.
    expect(clockSample(1_000, 5_100, 1_200)).toEqual({ rtt: 200, offset: 4_000 });
  });

  test("the sample with the lowest round trip wins", () => {
    const slow = { rtt: 300, offset: 4_100 };
    const fast = { rtt: 40, offset: 3_990 };
    expect(bestClockSample([])).toBeNull();
    expect(bestClockSample([slow])).toBe(slow);
    expect(bestClockSample([slow, fast])).toBe(fast);
    expect(bestClockSample([fast, slow])).toBe(fast);
  });

  test("only the last 10 samples count: an old fast one ages out", () => {
    const fast = { rtt: 40, offset: 3_990 };
    let recent = addClockSample([], fast);
    for (let i = 0; i < CLOCK_SAMPLES - 1; i++) recent = addClockSample(recent, { rtt: 300 + i, offset: 4_100 });
    expect(bestClockSample(recent)).toBe(fast);
    recent = addClockSample(recent, { rtt: 400, offset: 4_200 });
    expect(recent).toHaveLength(CLOCK_SAMPLES);
    expect(bestClockSample(recent)).toEqual({ rtt: 300, offset: 4_100 });
  });
});

describe("follow", () => {
  function fakePlayer(time: number, buffering: boolean) {
    const calls: string[] = [];
    const player: Player = {
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      seek: (p) => calls.push(`seek ${p}`),
      setRate: (r) => calls.push(`rate ${r}`),
      setVolume: () => {},
      setMuted: () => {},
      currentTime: () => time,
      isPaused: () => true,
      isBuffering: () => buffering,
      duration: () => 0,
      supportsRate: true,
      destroy: () => {},
    };
    return { player, calls };
  }

  test("drift jumps when not buffering", () => {
    const { player, calls } = fakePlayer(10, false);
    follow(player, state({ playing: true, position: 10 }), 0, 15_000);
    expect(calls).toEqual(["play", "rate 1", "seek 15"]);
  });

  test("buffering skips the jump but still applies play and rate", () => {
    const { player, calls } = fakePlayer(10, true);
    follow(player, state({ playing: true, position: 10 }), 0, 15_000);
    expect(calls).toEqual(["play", "rate 1"]);
  });
});
