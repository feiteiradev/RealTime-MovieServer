// The Local File Source: a <video> element fed from the Viewer's own copy (ADR-0001).
import type { Player, PlayerEvents } from "./player";

export const CANT_DECODE = "Your browser can't play this file, try an MP4 copy";

/** Loads file into video and resolves once its metadata (duration) is known. */
function load(video: HTMLVideoElement, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error(CANT_DECODE)), { once: true });
    video.src = URL.createObjectURL(file);
  });
}

/** Reads a file's length in seconds without playing it, for setMedia. */
export async function readDuration(file: File): Promise<number> {
  const video = document.createElement("video");
  video.preload = "metadata";
  try {
    await load(video, file);
    // e.g. a MediaRecorder webm reports Infinity: it would reach the server as null.
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("Can't read this file's length; try an MP4 copy");
    return video.duration;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

export async function createLocalFilePlayer(video: HTMLVideoElement, file: File, events: PlayerEvents): Promise<Player> {
  try {
    await load(video, file);
  } catch (err) {
    URL.revokeObjectURL(video.src);
    throw err;
  }
  const listening = new AbortController();
  const on = (type: string, fn: () => void) => video.addEventListener(type, fn, { signal: listening.signal });

  // Echo suppression: `playing` is the play/pause state we last asked for (or accepted from
  // the Viewer), so a play/pause event that matches it is ours. A seeked after our own seek
  // is ours too; overlapping seeks fire one seeked, so a flag (not a counter) is right.
  let playing = false;
  let ownSeek = false;
  let rate = video.playbackRate; // likewise, the speed we last set


  on("play", () => {
    if (playing) return;
    playing = true;
    events.onUserPlay(video.currentTime);
  });
  on("pause", () => {
    if (!playing || video.ended) return; // reaching the end is reported by "ended"
    playing = false;
    events.onUserPause(video.currentTime);
  });
  on("ended", () => {
    playing = false;
    events.onEnded(video.currentTime);
  });
  on("seeked", () => {
    if (ownSeek) ownSeek = false;
    else events.onUserSeek(video.currentTime);
  });
  on("ratechange", () => {
    if (video.playbackRate === rate) return; // ours
    rate = video.playbackRate;
    events.onUserRate(rate);
  });
  on("waiting", () => events.onBuffering(true));
  on("playing", () => events.onBuffering(false));
  on("error", () => events.onError(CANT_DECODE));

  return {
    play() {
      if (video.ended) return; // a finished copy stays finished; play() would restart it from 0
      playing = true;
      video.play().catch(() => {}); // blocked autoplay: the next sync tick tries again
    },
    pause() {
      playing = false;
      video.pause();
    },
    seek(position) {
      ownSeek = true;
      video.currentTime = position;
    },
    setRate(r) {
      rate = r;
      if (video.playbackRate !== r) video.playbackRate = r;
    },
    setVolume(volume) {
      video.volume = volume;
    },
    setMuted(muted) {
      video.muted = muted;
    },
    currentTime: () => video.currentTime,
    duration: () => video.duration,
    isPaused: () => video.paused,
    isBuffering: () => video.seeking, // not readyState: a paused copy can sit below HAVE_FUTURE_DATA and must still jump to the Room
    supportsRate: true,
    destroy() {
      listening.abort();
      video.pause();
      URL.revokeObjectURL(video.src);
      video.removeAttribute("src");
      video.load();
    },
  };
}
