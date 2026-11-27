import { useEffect, useRef, useState } from "react";
import type { PlaybackState } from "./protocol";
import type { Player, PlayerEvents } from "./player/player";
import { createLocalFilePlayer } from "./player/localFilePlayer";
import { follow } from "./sync";
import { TransportControls } from "./TransportControls";

const FOLLOW_EVERY_MS = 250;

type Props = {
  file: File;
  playback: PlaybackState;
  /** Server clock minus local clock, ms. */
  offset: () => number;
  /** Must only read refs: it's captured once per file. */
  events: PlayerEvents;
};

/** Plays the Viewer's own copy and keeps it following the Playback State. */
export function LocalFilePlayer({ file, playback, offset, events }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [ready, setReady] = useState<Player | null>(null);
  const latest = useRef(playback);
  latest.current = playback;

  useEffect(() => {
    // A fresh <video> per mount, so a cancelled load can't tear down the next one.
    const video = document.createElement("video");
    video.controls = true;
    video.setAttribute("aria-label", file.name);
    video.className = "w-full rounded bg-black";
    container.current!.appendChild(video);
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    createLocalFilePlayer(video, file, events).then(
      (p) => {
        if (cancelled) return p.destroy();
        player.current = p;
        setReady(p);
        follow(p, latest.current, offset(), Date.now());
        timer = setInterval(() => follow(p, latest.current, offset(), Date.now()), FOLLOW_EVERY_MS);
      },
      (err: Error) => !cancelled && events.onError(err.message),
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
      player.current?.destroy();
      player.current = null;
      setReady(null);
      video.remove();
    };
  }, [file]);

  useEffect(() => {
    if (player.current) follow(player.current, playback, offset(), Date.now());
  }, [playback]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={container} />
      {ready && <TransportControls player={ready} playback={playback} events={events} />}
    </div>
  );
}
