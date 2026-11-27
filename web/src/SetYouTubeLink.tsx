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
    <form onSubmit={submit} className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1.5">
      <label htmlFor="youtube-link" className="text-[13px] font-medium text-soft">
        Set a YouTube link
      </label>
      <div className="flex gap-2">
        <input
          id="youtube-link"
          className="field flex-1"
          value={link}
          inputMode="url"
          placeholder="https://youtu.be/…"
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Play
        </button>
      </div>
    </form>
  );
}
