import { useEffect, useRef, useState } from "react";
import type { PlaybackState } from "./protocol";
import type { Player, PlayerEvents } from "./player/player";
import { createYouTubePlayer } from "./player/youtubePlayer";
import { follow } from "./sync";
import { TransportControls } from "./TransportControls";

const FOLLOW_EVERY_MS = 250;

type Props = {
  videoId: string;
  playback: PlaybackState;
  /** Server clock minus local clock, ms. */
  offset: () => number;
  /** Must only read refs: it's captured once per video. */
  events: PlayerEvents;
};

/** Embeds a YouTube video and keeps it following the Playback State. */
export function YouTubePlayer({ videoId, playback, offset, events }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [ready, setReady] = useState<Player | null>(null);
  const latest = useRef(playback);
  latest.current = playback;
  // An embed error hides the player, leaving only the readable message.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    // A fresh element per mount; the IFrame API replaces it with its <iframe>.
    const slot = document.createElement("div");
    container.current!.appendChild(slot);
    const fail = (message: string) => {
      setFailed(true);
      events.onError(message);
    };
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    createYouTubePlayer(slot, videoId, { ...events, onError: fail }).then(
      (p) => {
        if (cancelled) return p.destroy();
        player.current = p;
        setReady(p);
        follow(p, latest.current, offset(), Date.now());
        timer = setInterval(() => follow(p, latest.current, offset(), Date.now()), FOLLOW_EVERY_MS);
      },
      (err: Error) => !cancelled && fail(err.message),
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
      player.current?.destroy();
      player.current = null;
      setReady(null);
      container.current?.replaceChildren();
    };
  }, [videoId]);

  useEffect(() => {
    if (player.current) follow(player.current, playback, offset(), Date.now());
  }, [playback]);

  return (
    <div className="flex flex-col gap-3" hidden={failed}>
      <div ref={container} className="aspect-video w-full overflow-hidden rounded-xl border border-line bg-black [&>iframe]:h-full [&>iframe]:w-full" />
      {ready && <TransportControls player={ready} playback={playback} events={events} />}
    </div>
  );
}
