import type { FeedEntry } from "./protocol";

/** A position in seconds as m:ss, or h:mm:ss past an hour. */
function clock(seconds: number): string {
  const s = Math.floor(seconds);
  const mm = String(Math.floor(s / 60) % 60);
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** The entry as a sentence, such as "Ana paused at 12:04". */
export function describeEntry(e: FeedEntry): string {
  const at = clock(e.position ?? 0);
  switch (e.action) {
    case "join":
      return `${e.nickname} joined`;
    case "leave":
      return `${e.nickname} left`;
    case "play":
      return `${e.nickname} played from ${at}`;
    case "pause":
      return `${e.nickname} paused at ${at}`;
    case "seek":
      return `${e.nickname} jumped to ${at}`;
    case "setMedia":
      return e.mediaItem?.source === "youtube"
        ? `${e.nickname} set a YouTube video`
        : `${e.nickname} set ${e.mediaItem?.name}`;
    case "rate":
      return `${e.nickname} set speed to ${e.rate}×`;
  }
}
