// Pure timing rules for following the Room's Playback State. All times are ms except
// positions, which are seconds. "offset" is server clock minus local clock.
import type { Player } from "./player/player";
import type { PlaybackState } from "./protocol";

/** Drift at or above this is corrected with a jump; below it is left alone so playback doesn't stutter. */
export const DRIFT_THRESHOLD_SECONDS = 1;

export function expectedPosition(state: PlaybackState, serverNow: number): number {
  return state.position + (state.playing ? ((serverNow - state.updatedAt) / 1000) * state.rate : 0);
}

export type DriftDecision = { action: "leave" } | { action: "jump"; to: number };

export function decideDrift(state: PlaybackState, offset: number, localNow: number, playerTime: number): DriftDecision {
  if (!state.mediaItem) return { action: "leave" };
  const expected = expectedPosition(state, localNow + offset);
  return Math.abs(playerTime - expected) >= DRIFT_THRESHOLD_SECONDS ? { action: "jump", to: expected } : { action: "leave" };
}

/**
 * Brings any Source's player in line with the Playback State: play/pause and rate directly, position by the drift rule.
 * No jump while buffering: the clock stands still after a jump, so a slow Viewer would otherwise re-jump forever.
 */
export function follow(player: Player, state: PlaybackState, offset: number, localNow: number): void {
  if (state.playing === player.isPaused()) {
    if (state.playing) player.play();
    else player.pause();
  }
  if (player.supportsRate) player.setRate(state.rate);
  if (player.isBuffering()) return;
  const drift = decideDrift(state, offset, localNow, player.currentTime());
  if (drift.action === "jump") player.seek(drift.to);
}

export type ClockSample = { rtt: number; offset: number };

/** One ping/pong round trip, assuming the server answered halfway through it. */
export function clockSample(clientSent: number, serverTime: number, clientReceived: number): ClockSample {
  return { rtt: clientReceived - clientSent, offset: serverTime - (clientSent + clientReceived) / 2 };
}

/** Keeps the sample with the lowest round trip: it has the least room for error. */
export function bestClockSample(best: ClockSample | null, sample: ClockSample): ClockSample {
  return best && best.rtt <= sample.rtt ? best : sample;
}
