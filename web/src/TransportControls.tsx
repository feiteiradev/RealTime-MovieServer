import { useEffect, useRef, useState } from "react";
import { RATES, type PlaybackState } from "./protocol";
import type { Player, PlayerEvents } from "./player/player";

const JUMP_SECONDS = 10;
const VOLUME_STEP = 0.1;

type Action = "toggle" | "back" | "forward" | "louder" | "quieter";
const KEYS: Record<string, Action> = { " ": "toggle", ArrowLeft: "back", ArrowRight: "forward", ArrowUp: "louder", ArrowDown: "quieter" };

/** The shortcut for a key, or null while the Viewer is typing in a field. */
export function shortcut(key: string, target: { tagName: string; isContentEditable: boolean } | null): Action | null {
  if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return null;
  return KEYS[key] ?? null;
}

type Props = { player: Player; playback: PlaybackState; events: PlayerEvents };

/** Speed and ±10 s are Shared Controls, sent through the player events; volume and mute stay local. */
export function TransportControls({ player, playback, events }: Props) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  // YouTube items carry no duration; its player clamps a seek past the end itself.
  const duration = playback.mediaItem?.source === "local" ? playback.mediaItem.duration : Infinity;

  const jump = (delta: number) => events.onUserSeek(Math.min(Math.max(player.currentTime() + delta, 0), duration));
  const changeVolume = (v: number) => {
    v = Math.round(Math.min(Math.max(v, 0), 1) * 10) / 10;
    setVolume(v);
    player.setVolume(v);
  };

  // Latest handlers for the one window listener.
  const act = useRef<(a: Action) => void>(() => {});
  act.current = (a) => {
    if (a === "toggle") (player.isPaused() ? events.onUserPlay : events.onUserPause)(player.currentTime());
    else if (a === "back") jump(-JUMP_SECONDS);
    else if (a === "forward") jump(JUMP_SECONDS);
    else changeVolume(volume + (a === "louder" ? VOLUME_STEP : -VOLUME_STEP));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = shortcut(e.key, e.target instanceof HTMLElement ? e.target : null);
      if (!a || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // stop the page scrolling and native video/button handling doubling up
      act.current(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div role="group" aria-label="Playback controls" className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 text-[13px] text-muted">
      <button type="button" className="btn grow tabular-nums sm:grow-0" onClick={() => jump(-JUMP_SECONDS)} aria-label="Back 10 seconds">
        −10 s
      </button>
      <button type="button" className="btn grow tabular-nums sm:grow-0" onClick={() => jump(JUMP_SECONDS)} aria-label="Forward 10 seconds">
        +10 s
      </button>
      <label className="flex items-center gap-2 has-disabled:text-faint" title={player.supportsRate ? undefined : "Not supported for this source"}>
        Speed
        <select
          className="h-11 rounded-lg border border-edge bg-raised px-2.5 text-sm text-ink disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-faint"
          value={playback.rate}
          disabled={!player.supportsRate}
          onChange={(e) => events.onUserRate(Number(e.target.value))}
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        {!player.supportsRate && <span>Not supported for this source</span>}
      </label>
      <label className="flex min-w-40 flex-1 items-center gap-2 sm:justify-end">
        Volume
        <input
          type="range"
          className="h-11 w-full max-w-32 cursor-pointer accent-ember"
          min={0}
          max={1}
          step={VOLUME_STEP}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
        />
      </label>
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-edge px-3 text-ink">
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-ember"
          checked={muted}
          onChange={(e) => {
            setMuted(e.target.checked);
            player.setMuted(e.target.checked);
          }}
        />
        Mute
      </label>
    </div>
  );
}
