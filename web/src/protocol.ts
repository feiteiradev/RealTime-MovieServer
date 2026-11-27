// The WebSocket protocol. Mirror of server/room/protocol.go: change both together.

export type Viewer = { id: string; nickname: string; status: string };

/** Flat across Sources; each Source uses its own fields. */
export type MediaItem = {
  source: "local";
  /** Local File details, read from the setter's file. The file itself never leaves their machine. */
  name: string;
  size: number;
  duration: number;
};

/** Expected position: position + (playing ? (serverNow − updatedAt)/1000 × rate : 0). */
export type PlaybackState = {
  mediaItem: MediaItem | null;
  playing: boolean;
  /** Seconds. */
  position: number;
  rate: number;
  /** Server Unix ms. */
  updatedAt: number;
};

export type ClientMessage =
  | { type: "join"; nickname: string }
  | { type: "play"; position: number }
  | { type: "pause"; position: number }
  | { type: "seek"; position: number }
  | { type: "setMedia"; mediaItem: MediaItem }
  | { type: "ping"; clientTime: number };

/** One line of the Activity Feed. */
export type FeedEntry = {
  /** Server Unix ms. */
  at: number;
  nickname: string;
  action: "join" | "leave" | "play" | "pause" | "seek" | "setMedia";
  /** play, pause, seek: seconds. */
  position?: number;
  /** setMedia. */
  mediaItem?: MediaItem;
};

export type ServerMessage =
  /** feed: the last 50 Activity Feed entries, oldest first. */
  | { type: "welcome"; viewerId: string; state: PlaybackState; viewers: Viewer[]; feed: FeedEntry[] }
  | { type: "feed"; entry: FeedEntry }
  | { type: "viewers"; viewers: Viewer[] }
  | { type: "state"; state: PlaybackState; byViewerId: string }
  | { type: "pong"; clientTime: number; serverTime: number }
  | { type: "error"; message: string };
