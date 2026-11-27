// The WebSocket protocol. Mirror of server/room/protocol.go: change both together.

export type Viewer = { id: string; nickname: string; status: string };

export type ClientMessage = { type: "join"; nickname: string };

export type ServerMessage =
  | { type: "welcome"; viewerId: string; viewers: Viewer[] }
  | { type: "viewers"; viewers: Viewer[] }
  | { type: "error"; message: string };
