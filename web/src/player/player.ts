// The one interface every Source's player implements. A Source module exports a factory
// `(container/element, source input, events) => Promise<Player>` that resolves once the
// media is loaded and ready to be driven.

/**
 * Methods are called on the Room's behalf and must never fire the user-action callbacks
 * (otherwise remote state would echo back as a new command).
 */
export interface Player {
  play(): void;
  pause(): void;
  /** Seconds. */
  seek(position: number): void;
  setRate(rate: number): void;
  /** Personal, never shared. 0..1. */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Seconds. */
  currentTime(): number;
  /** Seconds; 0 or non-finite when not known. */
  duration(): number;
  isPaused(): boolean;
  /** Still loading after a seek or a stall: the position isn't advancing yet. */
  isBuffering(): boolean;
  /** False for Sources that can't change speed; the speed control is then disabled. */
  readonly supportsRate: boolean;
  destroy(): void;
}

/** What the player reports. The onUser* callbacks fire only for the Viewer's own actions. */
export interface PlayerEvents {
  onUserPlay(position: number): void;
  onUserPause(position: number): void;
  onUserSeek(position: number): void;
  onUserRate(rate: number): void;
  onBuffering(buffering: boolean): void;
  onEnded(position: number): void;
  /** A readable message for the Viewer, e.g. the file can't be decoded. */
  onError(message: string): void;
}
