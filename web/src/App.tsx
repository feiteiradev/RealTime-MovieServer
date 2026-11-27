import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ClientMessage, ServerMessage, Viewer } from "./protocol";

const NICKNAME_KEY = "campfire.nickname";

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
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => () => socket.current?.close(), []);

  function join(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      localStorage.setItem(NICKNAME_KEY, nickname.trim());
    } catch {
      // Storage blocked: the Nickname just won't be pre-filled next time.
    }
    const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
    socket.current?.close();
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    socket.current = ws;
    ws.onopen = () => send({ type: "join", nickname });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      switch (msg.type) {
        case "welcome":
          setViewerId(msg.viewerId);
          setViewers(msg.viewers);
          break;
        case "viewers":
          setViewers(msg.viewers);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };
    ws.onclose = () => {
      if (socket.current === ws) setViewerId(null);
    };
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

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-2xl font-bold">Campfire</h1>
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
    </main>
  );
}
