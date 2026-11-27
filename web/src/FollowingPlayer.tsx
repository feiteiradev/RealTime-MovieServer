import { useEffect, useRef, useState } from "react";
import type { PlaybackState } from "./protocol";
import type { Player, PlayerEvents } from "./player/player";
import { follow } from "./sync";
import { TransportControls, type Volume } from "./TransportControls";

const FOLLOW_EVERY_MS = 250;

type Props = {
  /** The Source input (a file, a videoId); a new one makes a new player. */
  sourceKey: unknown;
  /** Builds the Source's player inside a fresh slot element. Captured once per sourceKey. */
  create: (slot: HTMLElement, events: PlayerEvents) => Promise<Player>;
  playback: PlaybackState;
  /** Server clock minus local clock, ms. */
  offset: () => number;
  /** Must only read refs: it's captured once per sourceKey. */
  events: PlayerEvents;
  volume: Volume;
  onVolume: (v: Volume) => void;
  /** Classes for the element the slot goes in. */
  className?: string;
  /** An error hides the player, leaving only the readable message. */
  hideOnError?: boolean;
  /** The player is loaded and ready, e.g. to read its duration. Captured once per sourceKey. */
  onReady?: (player: Player) => void;
};

/** Any Source's player, kept following the Playback State, with the Transport Controls under it. */
export function FollowingPlayer({ sourceKey, create, playback, offset, events, volume, onVolume, className, hideOnError, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<Player | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(playback);
  const settle = useRef({ check: false }); // per player; see follow()
  latest.current = playback;

  useEffect(() => {
    setFailed(false);
    // A fresh slot per mount, so a cancelled load can't tear down the next one.
    const slot = document.createElement("div");
    container.current!.appendChild(slot);
    const fail = (message: string) => {
      if (hideOnError) setFailed(true);
      events.onError(message);
    };
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let player: Player | undefined;
    settle.current = { check: false };
    create(slot, { ...events, onError: fail }).then(
      (p) => {
        if (cancelled) return p.destroy();
        player = p;
        setReady(p); // the [playback, ready] effect follows it straight away
        onReady?.(p);
        events.onBuffering(false); // a fresh player isn't buffering yet
        timer = setInterval(() => follow(p, latest.current, offset(), Date.now(), settle.current), FOLLOW_EVERY_MS);
      },
      (err: Error) => !cancelled && fail(err.message),
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
      player?.destroy();
      setReady(null);
      events.onBuffering(false);
      container.current?.replaceChildren(); // the IFrame API swaps the slot for its <iframe>
    };
  }, [sourceKey]);

  useEffect(() => {
    if (ready) follow(ready, playback, offset(), Date.now(), settle.current);
  }, [playback, ready]);

  // Volume is the Viewer's own and outlives any one player.
  useEffect(() => {
    ready?.setVolume(volume.level);
    ready?.setMuted(volume.muted);
  }, [ready, volume]);

  return (
    <div className="flex flex-col gap-3" hidden={failed}>
      <div ref={container} className={className} />
      {ready && <TransportControls player={ready} playback={playback} events={events} volume={volume} onVolume={onVolume} />}
    </div>
  );
}
