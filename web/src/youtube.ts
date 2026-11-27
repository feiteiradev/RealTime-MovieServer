// Pure rules for the YouTube Source.

export const NOT_A_YOUTUBE_LINK = "That's not a valid YouTube link";

/** Same rule as the server's: YouTube ids are 11 URL-safe base64 characters. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The videoId of a watch, youtu.be or Shorts link, or null for anything else. */
export function parseYouTubeLink(link: string): string | null {
  const text = link.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id: string | null | undefined;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" && url.pathname === "/watch") id = url.searchParams.get("v");
  else if (host === "youtube.com") id = url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
  return id && VIDEO_ID.test(id) ? id : null;
}

/** A readable message for an IFrame Player API error code. */
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 100:
      return "This YouTube video can't play here: it's not found or private";
    case 101:
    case 150:
      return "The owner of this YouTube video disabled embedding, so it can't play here";
    case 153:
      return "YouTube refused to play without this page's referrer; check the server sends Referrer-Policy";
    default:
      return `YouTube can't play this video (error ${code})`;
  }
}

export type TimeSample = { /** Seconds. */ time: number; /** Local ms. */ at: number };

/** Seconds a sample may stray from steady playback before it counts as a seek. */
const SEEK_JUMP_SECONDS = 1;

/**
 * The IFrame API has no seek event, so a seek shows up as the time jumping between two
 * samples by more than steady playback (or standing still, when paused) explains.
 */
export function seekedByUser(last: TimeSample, now: TimeSample, advancing: boolean, rate: number): boolean {
  const expected = last.time + (advancing ? ((now.at - last.at) / 1000) * rate : 0);
  return Math.abs(now.time - expected) > SEEK_JUMP_SECONDS;
}
