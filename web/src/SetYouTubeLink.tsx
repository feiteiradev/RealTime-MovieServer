import { useState, type FormEvent } from "react";
import { NOT_A_YOUTUBE_LINK, parseYouTubeLink } from "./youtube";

/** Lets any Viewer paste a YouTube link; invalid links are rejected before anything is sent. */
export function SetYouTubeLink({ onSet, onError }: { onSet: (videoId: string) => void; onError: (message: string) => void }) {
  const [link, setLink] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const videoId = parseYouTubeLink(link);
    if (!videoId) return onError(NOT_A_YOUTUBE_LINK);
    onSet(videoId);
    setLink("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <label htmlFor="youtube-link">Set a YouTube link</label>
      <div className="flex gap-2">
        <input
          id="youtube-link"
          className="flex-1 rounded border p-2"
          value={link}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" className="rounded border p-2">
          Play
        </button>
      </div>
    </form>
  );
}
