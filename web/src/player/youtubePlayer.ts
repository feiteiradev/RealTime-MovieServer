// The YouTube Source: the IFrame Player API behind the Player interface.
import type { Player, PlayerEvents } from "./player";
import { seekedByUser, youtubeErrorMessage, type TimeSample } from "../youtube";

// The slice of the IFrame Player API used here (no @types package for a handful of calls).
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events: {
        onReady(): void;
        onStateChange(e: { data: number }): void;
        onError(e: { data: number }): void;
      };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const SAMPLE_EVERY_MS = 250;
const OWN_SEEK_PLAY_MS = 1000;

let api: Promise<YTNamespace> | undefined;
function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      api = undefined; // let the next Media Item try again
      reject(new Error("Couldn't reach YouTube; check your connection"));
    };
    document.head.appendChild(script);
  });
  return api;
}

/** Replaces element with a YouTube player; resolves once the video is ready to drive. */
export async function createYouTubePlayer(element: HTMLElement, videoId: string, events: PlayerEvents): Promise<Player> {
  const YT = await loadApi();

  // Echo suppression, as in the Local File adapter: `playing` is the play/pause state we last
  // asked for (or accepted from the Viewer), so a state change that matches it is ours. Seeks
  // have no event, so `last` samples the time and our own seek() resets it to the target.
  let playing = false;
  let last: TimeSample = { time: 0, at: performance.now() };
  // seekTo on a video that hasn't started yet also starts it; that play is ours, not the Viewer's.
  let ownSeekAt = -Infinity;

  const p = await new Promise<YTPlayer>((resolve, reject) => {
    let ready = false;
    const player: YTPlayer = new YT.Player(element, {
      videoId,
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: () => {
          ready = true;
          resolve(player);
        },
        onError: (e) => {
          if (ready) events.onError(youtubeErrorMessage(e.data));
          else {
            player.destroy();
            reject(new Error(youtubeErrorMessage(e.data)));
          }
        },
        onStateChange: (e) => {
          if (!ready) return;
          const time = player.getCurrentTime();
          if (e.data === PLAYING) {
            events.onBuffering(false);
            if (!playing && performance.now() - ownSeekAt < OWN_SEEK_PLAY_MS) {
              player.pauseVideo();
            } else if (!playing) {
              playing = true;
              events.onUserPlay(time);
            }
          } else if (e.data === PAUSED && playing) {
            playing = false;
            events.onUserPause(time);
          } else if (e.data === ENDED) {
            playing = false;
            events.onEnded(time);
          } else if (e.data === BUFFERING) {
            events.onBuffering(true);
          }
        },
      },
    });
  });

  const advancing = () => p.getPlayerState() === PLAYING;
  const sampler = setInterval(() => {
    const now = { time: p.getCurrentTime(), at: performance.now() };
    if (seekedByUser(last, now, advancing(), p.getPlaybackRate())) events.onUserSeek(now.time);
    last = now;
  }, SAMPLE_EVERY_MS);

  return {
    play() {
      playing = true;
      p.playVideo(); // blocked autoplay: the next sync tick tries again
    },
    pause() {
      playing = false;
      p.pauseVideo();
    },
    seek(position) {
      last = { time: position, at: performance.now() };
      ownSeekAt = last.at;
      p.seekTo(position, true);
    },
    setRate(rate) {
      if (p.getPlaybackRate() !== rate) p.setPlaybackRate(rate);
    },
    setVolume(volume) {
      p.setVolume(volume * 100);
    },
    setMuted(muted) {
      if (muted) p.mute();
      else p.unMute();
    },
    currentTime: () => p.getCurrentTime(),
    isPaused: () => {
      const s = p.getPlayerState();
      return s !== PLAYING && s !== BUFFERING;
    },
    supportsRate: true,
    destroy() {
      clearInterval(sampler);
      p.destroy();
    },
  };
}
