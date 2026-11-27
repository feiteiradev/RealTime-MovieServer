import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ClientMessage, FeedEntry, PlaybackState, ServerMessage, Viewer } from "./protocol";
import { ActivityFeed } from "./ActivityFeed";
import type { PlayerEvents } from "./player/player";
import { readDuration } from "./player/localFilePlayer";
import { LocalFilePlayer } from "./LocalFilePlayer";
import { bestClockSample, clockSample, type ClockSample } from "./sync";

const NICKNAME_KEY = "campfire.nickname";
const PING_EVERY_MS = 2000;

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
  const socket = useRef<WebSocket | null>(null);
  const playbackRef = useRef<PlaybackState | null>(null);
  const clock = useRef<ClockSample | null>(null);
  /** The file this Viewer just sent setMedia for; becomes their copy when the state comes back. */
  const settingFile = useRef<File | null>(null);

  useEffect(() => () => socket.current?.close(), []);

  const offset = () => clock.current?.offset ?? 0;
  const send = (msg: ClientMessage) => socket.current?.send(JSON.stringify(msg));
  const setPlayback = (s: PlaybackState) => {
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

  // Only reads refs: LocalFilePlayer captures it once per file.
  const playerEvents: PlayerEvents = {
    onUserPlay: (p) => control("play", p),
    onUserPause: (p) => control("pause", p),
    onUserSeek: (p) => control("seek", p),
    onEnded: (p) => control("pause", p),
    onBuffering: () => {}, // reported as Viewer status in a later ticket
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
    socket.current?.close();
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    socket.current = ws;
    let me = "";
    let pinger: ReturnType<typeof setInterval> | undefined;
    const ping = () => send({ type: "ping", clientTime: Date.now() });
    ws.onopen = () => send({ type: "join", nickname });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      switch (msg.type) {
        case "welcome":
          me = msg.viewerId;
          setViewerId(msg.viewerId);
          setViewers(msg.viewers);
          setPlayback(msg.state);
          setCopy(null);
          setFeed(msg.feed);
          ping();
          pinger = setInterval(ping, PING_EVERY_MS);
          break;
        case "viewers":
          setViewers(msg.viewers);
          break;
        case "state":
          if (msg.byViewerId === me && settingFile.current) {
            setCopy(settingFile.current); // the setter's file is their copy
            settingFile.current = null;
          } else if (JSON.stringify(msg.state.mediaItem) !== JSON.stringify(playbackRef.current?.mediaItem)) {
            setCopy(null); // a new Media Item: choose your copy of it
          }
          setPlayback(msg.state);
          break;
        case "pong":
          clock.current = bestClockSample(clock.current, clockSample(msg.clientTime, msg.serverTime, Date.now()));
          break;
        case "error":
          setError(msg.message);
          break;
        case "feed":
          setFeed((f) => [...f, msg.entry].slice(-50)); // the server keeps 50 too
          break;
      }
    };
    ws.onclose = () => {
      clearInterval(pinger);
      if (socket.current === ws) setViewerId(null);
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
      <main className="mx-auto max-w-sm p-4">
        <h1 className="mb-4 text-2xl font-bold">Campfire</h1>
        <form onSubmit={join} className="flex flex-col gap-2">
          <label htmlFor="nickname">Nickname</label>
          <input
            id="nickname"
            className="rounded border p-2"
            value={nickname}
            maxLength={32}
            required
            autoFocus
            onChange={(e) => setNickname(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className="rounded border p-2">
            Join
          </button>
        </form>
      </main>
    );
  }

  const item = playback?.mediaItem;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Campfire</h1>
      <section aria-labelledby="now-playing" className="flex flex-col gap-2">
        <h2 id="now-playing" className="font-semibold">
          Now playing
        </h2>
        {!item && <p>Nothing playing yet. Set a Local File to start.</p>}
        {item && !copy && (
          <label className="flex flex-col gap-1">
            Choose your copy of {item.name}
            <input type="file" accept="video/*,audio/*" onChange={chooseCopy} />
          </label>
        )}
        {item && copy && playback && (
          <LocalFilePlayer file={copy} playback={playback} offset={offset} events={playerEvents} />
        )}
        <label className="flex flex-col gap-1">
          Set a Local File
          <input type="file" accept="video/*,audio/*" onChange={setLocalFile} />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </section>
      <section aria-labelledby="presence">
        <h2 id="presence" className="font-semibold">
          In the Room ({viewers.length})
        </h2>
        <ul>
          {viewers.map((v) => (
            <li key={v.id}>
              {v.nickname}
              {v.id === viewerId && " (you)"}
            </li>
          ))}
        </ul>
      </section>
      <ActivityFeed entries={feed} />
    </main>
  );
}
