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
  const duration = playback.mediaItem?.duration ?? 0;

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
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="rounded border px-2" onClick={() => jump(-JUMP_SECONDS)} aria-label="Back 10 seconds">
        −10 s
      </button>
      <button type="button" className="rounded border px-2" onClick={() => jump(JUMP_SECONDS)} aria-label="Forward 10 seconds">
        +10 s
      </button>
      <label className="flex items-center gap-1" title={player.supportsRate ? undefined : "Not supported for this source"}>
        Speed
        <select
          className="rounded border"
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
      </label>
      <label className="flex items-center gap-1">
        Volume
        <input type="range" min={0} max={1} step={VOLUME_STEP} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
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
