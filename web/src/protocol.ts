// The WebSocket protocol. Mirror of server/room/protocol.go: change both together.

/** "disconnected" is set by the server only. */
export type ViewerStatus = "watching" | "buffering" | "needsFile" | "disconnected";

export type Viewer = { id: string; nickname: string; status: ViewerStatus };

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
  | { type: "ping"; clientTime: number }
  | { type: "rate"; rate: number }
  | { type: "status"; status: Exclude<ViewerStatus, "disconnected"> };

/** One line of the Activity Feed. */
export type FeedEntry = {
  /** Server Unix ms. */
  at: number;
  nickname: string;
  action: "join" | "leave" | "play" | "pause" | "seek" | "setMedia" | "rate";
  /** play, pause, seek: seconds. */
  position?: number;
  /** setMedia. */
  mediaItem?: MediaItem;
  /** rate. */
  rate?: number;
};

export type ServerMessage =
  /** feed: the last 50 Activity Feed entries, oldest first. */
  | { type: "welcome"; viewerId: string; state: PlaybackState; viewers: Viewer[]; feed: FeedEntry[] }
  | { type: "feed"; entry: FeedEntry }
  | { type: "viewers"; viewers: Viewer[] }
  | { type: "state"; state: PlaybackState; byViewerId: string }
  | { type: "pong"; clientTime: number; serverTime: number }
  | { type: "error"; message: string };

/** The speeds a Viewer can choose. Mirror of room.Rates. */
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
