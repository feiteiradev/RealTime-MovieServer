import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  MAX_FEED_ENTRIES,
  MAX_NICKNAME_LENGTH,
  RATES,
  type ClientMessage,
  type FeedEntry,
  type MediaItem,
  type PlaybackState,
  type ServerMessage,
  type Viewer,
} from "./protocol";
import { ActivityFeed } from "./ActivityFeed";
import type { PlayerEvents } from "./player/player";
import { createLocalFilePlayer, readDuration } from "./player/localFilePlayer";
import { createYouTubePlayer } from "./player/youtubePlayer";
import { FollowingPlayer } from "./FollowingPlayer";
import type { Volume } from "./TransportControls";
import { CopyCheck } from "./CopyCheck";
import { Notice } from "./Notice";
import { SetYouTubeLink } from "./SetYouTubeLink";
import { bestClockSample, clockSample, expectedPosition, type ClockSample } from "./sync";

const NICKNAME_KEY = "campfire.nickname";
/** Only the lowest-RTT ping is kept: a quick few after joining, then an occasional one. */
const QUICK_PINGS = 5;
const PING_EVERY_MS = 2000;
const PING_SLOWLY_MS = 30_000;
/** Reconnect backoff: 0.5 s, 1 s, 2 s … up to 10 s between tries. */
const reconnectDelay = (attempt: number) => Math.min(500 * 2 ** attempt, 10_000);
const STATUS_LABEL: Record<Viewer["status"], string> = {
  watching: "watching",
  buffering: "buffering",
  needsFile: "needs file",
  disconnected: "disconnected",
};
const STATUS_DOT: Record<Viewer["status"], string> = {
  watching: "bg-ok",
  buffering: "bg-warn",
  needsFile: "ring-[1.5px] ring-inset ring-muted",
  disconnected: "bg-edge",
};

/** The same Media Item, compared by what identifies it. */
function sameItem(a: MediaItem | null | undefined, b: MediaItem | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.source === "youtube") return b.source === "youtube" && a.videoId === b.videoId;
  return b.source === "local" && a.name === b.name && a.size === b.size && a.duration === b.duration;
}

function savedNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [nickname, setNickname] = useState(savedNickname);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [playback, setPlaybackState] = useState<PlaybackState | null>(null);
  /** This Viewer's own copy of the current Local File, once chosen. */
  const [copy, setCopy] = useState<File | null>(null);
  /** The socket dropped and we're trying to get back in; controls reach nobody meanwhile. */
  const [reconnecting, setReconnecting] = useState(false);
  const [volume, setVolume] = useState<Volume>({ level: 1, muted: false });
  const unmounted = useRef(false);
  const socket = useRef<WebSocket | null>(null);
  const playbackRef = useRef<PlaybackState | null>(null);
  const clock = useRef<ClockSample | null>(null);
  /** The file this Viewer just sent setMedia for; becomes their copy when the state comes back. */
  const settingFile = useRef<File | null>(null);

  useEffect(() => {
    unmounted.current = false; // StrictMode's dev remount runs the cleanup below first
    return () => {
      unmounted.current = true;
      socket.current?.close();
    };
  }, []);

  // This Viewer's status, sent whenever it changes (and on joining).
  const [buffering, setBuffering] = useState(false);
  const status = playback?.mediaItem?.source === "local" && !copy ? "needsFile" : buffering ? "buffering" : "watching";
  useEffect(() => {
    if (viewerId) send({ type: "status", status });
  }, [viewerId, status, reconnecting]); // a rejoin resets it to watching on the server

  const offset = () => clock.current?.offset ?? 0;
  const send = (msg: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  };
  const setPlayback = (s: PlaybackState) => {
    if (!sameItem(s.mediaItem, playbackRef.current?.mediaItem)) setCopy(null); // a new Media Item: choose your copy of it
    playbackRef.current = s;
    setPlaybackState(s);
  };

  // A Shared Control from this Viewer: send it, and apply it locally until the server's
  // state arrives, so the player isn't pulled back in between.
  function control(type: "play" | "pause" | "seek", position: number) {
    send({ type, position });
    const s = playbackRef.current;
    if (!s) return;
    const playing = type === "seek" ? s.playing : type === "play";
    setPlayback({ ...s, playing, position, updatedAt: Date.now() + offset() });
  }

  // Only reads refs: FollowingPlayer captures it once per Media Item.
  const playerEvents: PlayerEvents = {
    onUserPlay: (p) => control("play", p),
    onUserPause: (p) => control("pause", p),
    onUserSeek: (p) => control("seek", p),
    onUserRate: (rate) => {
      send({ type: "rate", rate });
      const s = playbackRef.current;
      if (!s || !RATES.includes(rate)) return; // other speeds are rejected; follow() puts it back
      const now = Date.now() + offset();
      setPlayback({ ...s, position: expectedPosition(s, now), rate, updatedAt: now });
    },
    onEnded: (p) => {
      // A shorter copy ending early mustn't pause the Room for everyone.
      const item = playbackRef.current?.mediaItem;
      if (item?.source !== "local" || p >= item.duration - 1) control("pause", p);
    },
    onBuffering: setBuffering,
    onError: setError,
  };

  function join(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      localStorage.setItem(NICKNAME_KEY, nickname.trim());
    } catch {
      // Storage blocked: the Nickname just won't be pre-filled next time.
    }
    connect(nickname, null, 0);
  }

  // Opens the socket and joins; if it drops after joining, rejoins with the private rejoinToken, with backoff.
  function connect(name: string, rejoinToken: string | null, attempt: number) {
    socket.current?.close();
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    socket.current = ws;
    let me = "";
    let token = rejoinToken ?? "";
    let joined = false;
    let pinger: ReturnType<typeof setTimeout> | undefined;
    const ping = (n: number) => {
      send({ type: "ping", clientTime: Date.now() });
      pinger = setTimeout(() => ping(n + 1), n < QUICK_PINGS ? PING_EVERY_MS : PING_SLOWLY_MS);
    };
    ws.onopen = () => send(token ? { type: "join", nickname: name, rejoinToken: token } : { type: "join", nickname: name });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      switch (msg.type) {
        case "welcome":
          me = msg.viewerId;
          token = msg.rejoinToken;
          joined = true;
          setReconnecting(false);
          setViewerId(msg.viewerId);
          setViewers(msg.viewers);
          setPlayback(msg.state); // back in the same Media Item after a reconnect: keeps the chosen copy
          setFeed(msg.feed);
          ping(1);
          break;
        case "viewers":
          setViewers(msg.viewers);
          break;
        case "state":
          setPlayback(msg.state);
          if (msg.byViewerId === me && settingFile.current) {
            setCopy(settingFile.current); // the setter's file is their copy (set after setPlayback's clear)
            settingFile.current = null;
          }
          break;
        case "pong":
          clock.current = bestClockSample(clock.current, clockSample(msg.clientTime, msg.serverTime, Date.now()));
          break;
        case "error":
          setError(msg.message);
          break;
        case "feed":
          setFeed((f) => [...f, msg.entry].slice(-MAX_FEED_ENTRIES));
          break;
      }
    };
    ws.onclose = () => {
      clearTimeout(pinger);
      if (socket.current !== ws || unmounted.current) return; // replaced or closed on purpose
      if (!token) return setViewerId(null); // never got in: back to the join form
      setReconnecting(true);
      setTimeout(() => connect(name, token, joined ? 0 : attempt + 1), reconnectDelay(joined ? 0 : attempt));
    };
  }

  async function setLocalFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const duration = await readDuration(file);
      settingFile.current = file;
      send({ type: "setMedia", mediaItem: { source: "local", name: file.name, size: file.size, duration } });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function chooseCopy(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCopy(file);
  }

  if (!viewerId) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-6">
        <div className="flex w-full max-w-90 flex-col gap-8">
          <div className="flex flex-col gap-2.5">
            <Brand size="lg" />
            <p className="text-base/relaxed text-muted">Watch together, in step. Pick the name the others will see.</p>
          </div>
          <form onSubmit={join} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-2">
              <label htmlFor="nickname" className="text-[13px] font-medium text-soft">
                Nickname
              </label>
              <input
                id="nickname"
                className="field h-12"
                value={nickname}
                maxLength={MAX_NICKNAME_LENGTH}
                required
                autoFocus
                autoComplete="nickname"
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            <button type="submit" className="btn btn-primary h-12 text-[15px]">
              Join
            </button>
          </form>
        </div>
      </main>
    );
  }

  const item = playback?.mediaItem;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-310 flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-4 py-3.5 sm:px-6">
          <h1>
            <Brand />
          </h1>
          {/* Always mounted so screen readers announce the badge when it appears. */}
          <span aria-live="polite">
            {reconnecting && (
              <span
                role="status"
                className="inline-flex items-center gap-2 rounded-full border border-warn-edge bg-warn-bg px-3 py-1.5 text-[13px] font-medium text-warn"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-warn motion-safe:animate-pulse" />
                Reconnecting… your controls aren't reaching anyone
              </span>
            )}
          </span>
        </div>
      </header>
      <main className="mx-auto grid max-w-310 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="now-playing" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="now-playing" className="heading">
              Now playing
            </h2>
            {item?.source === "local" && <span className="truncate font-mono text-[13px] text-muted">{item.name}</span>}
          </div>
          {!item && (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge bg-surface/60 p-5 text-center">
              <p className="text-base font-medium">The Room is empty.</p>
              <p className="max-w-72 text-sm text-muted">Add something to watch: set a Local File or a YouTube link below.</p>
            </div>
          )}
          {item?.source === "youtube" && playback && (
            <FollowingPlayer
              sourceKey={item.videoId}
              create={(slot, events) => createYouTubePlayer(slot, item.videoId, events)}
              playback={playback}
              offset={offset}
              events={playerEvents}
              volume={volume}
              onVolume={setVolume}
              className="aspect-video w-full overflow-hidden rounded-xl border border-line bg-black [&>iframe]:h-full [&>iframe]:w-full"
              hideOnError
            />
          )}
          {item?.source === "local" && !copy && (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-5 text-center">
              <p className="max-w-80 text-sm text-muted">Each Viewer plays their own copy of a Local File. Nothing is uploaded.</p>
              <label className="btn btn-primary file-btn h-auto min-h-11 max-w-full py-2 break-all">
                <span>Choose your copy of {item.name}</span>
                <input type="file" accept="video/*,audio/*" className="sr-only" onChange={chooseCopy} />
              </label>
            </div>
          )}
          {item?.source === "local" && copy && playback && (
            <FollowingPlayer
              sourceKey={copy}
              create={(slot, events) => {
                const video = document.createElement("video");
                video.controls = true;
                video.setAttribute("aria-label", copy.name);
                video.className = "aspect-video w-full rounded-xl border border-line bg-black";
                slot.appendChild(video);
                return createLocalFilePlayer(video, copy, events);
              }}
              playback={playback}
              offset={offset}
              events={playerEvents}
              volume={volume}
              onVolume={setVolume}
            />
          )}
          {item?.source === "local" && copy && <CopyCheck item={item} copy={copy} />}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-col gap-2 pt-2">
            <h3 className="heading">Put something on</h3>
            <div className="flex flex-wrap items-end gap-2">
              <SetYouTubeLink
                onSet={(videoId) => {
                  setError(null);
                  send({ type: "setMedia", mediaItem: { source: "youtube", videoId } });
                }}
                onError={setError}
              />
              <label className="btn file-btn grow border-dashed sm:grow-0">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
                </svg>
                Set a Local File
                <input type="file" accept="video/*,audio/*" className="sr-only" onChange={setLocalFile} />
              </label>
            </div>
          </div>
        </section>
        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="presence" className="flex flex-col gap-2.5">
            <h2 id="presence" className="heading">
              In the Room ({viewers.length})
            </h2>
            <ul className="divide-y divide-raised rounded-xl border border-line bg-surface">
              {viewers.map((v) => (
                <li key={v.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOT[v.status] ?? "bg-edge"}`} />
                  <span className="min-w-0 flex-1 truncate">
                    {v.nickname}
                    {v.id === viewerId && " (you)"}
                  </span>
                  <span className="text-[13px] text-muted">
                    <span className="sr-only"> · </span>
                    {STATUS_LABEL[v.status] ?? v.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <ActivityFeed entries={feed} />
        </aside>
      </main>
    </div>
  );
}

function Brand({ size }: { size?: "lg" }) {
  return (
    <span className={`flex items-center gap-2.5 font-semibold tracking-tight ${size === "lg" ? "text-[28px]" : "text-base"}`}>
      <span aria-hidden="true" className="size-2.5 rounded-full bg-ember shadow-[0_0_14px_var(--color-ember)]" />
      Campfire
    </span>
  );
}
