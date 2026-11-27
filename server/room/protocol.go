package room

// The WebSocket protocol: JSON objects with a "type" field, other fields flat beside it.
// Mirror any change here in web/src/protocol.ts.

// Client → server.

type Join struct {
	Nickname string `json:"nickname"`
}

// Position is the body of play, pause and seek.
type Position struct {
	Position float64 `json:"position"` // seconds
}

type SetMedia struct {
	MediaItem MediaItem `json:"mediaItem"`
}

// Ping asks for the server time so the client can estimate its clock offset.
type Ping struct {
	ClientTime float64 `json:"clientTime"` // client ms, echoed back untouched
}

// Status is the sender's own Viewer status: "watching", "buffering" or "needsFile".
type Status struct {
	Status string `json:"status"`
}

// Server → client.

type Pong struct {
	Type       string  `json:"type"` // "pong"
	ClientTime float64 `json:"clientTime"`
	ServerTime int64   `json:"serverTime"` // server Unix ms
}

type Welcome struct {
	Type     string        `json:"type"` // "welcome"
	ViewerID string        `json:"viewerId"`
	State    PlaybackState `json:"state"`
	Viewers  []Viewer      `json:"viewers"`
}

// State is sent to every Viewer after any Shared Control or setMedia.
type State struct {
	Type       string        `json:"type"` // "state"
	State      PlaybackState `json:"state"`
	ByViewerID string        `json:"byViewerId"`
}

// PlaybackState is the Room's single shared truth. A client's expected position is
// position + (playing ? (serverNow − updatedAt)/1000 × rate : 0).
type PlaybackState struct {
	MediaItem *MediaItem `json:"mediaItem"` // null when nothing is set
	Playing   bool       `json:"playing"`
	Position  float64    `json:"position"`  // seconds
	Rate      float64    `json:"rate"`      // 1 = normal speed
	UpdatedAt int64      `json:"updatedAt"` // server Unix ms
}

// MediaItem is flat across Sources; each Source uses its own fields.
type MediaItem struct {
	Source string `json:"source"` // "local" or "youtube"
	// Local File: read from the setter's file; the file itself never leaves their machine.
	Name     string  `json:"name,omitempty"`
	Size     int64   `json:"size,omitempty"`     // bytes
	Duration float64 `json:"duration,omitempty"` // seconds
	// YouTube: the 11-character id from the link.
	VideoID string `json:"videoId,omitempty"`
}

type Viewers struct {
	Type    string   `json:"type"` // "viewers"
	Viewers []Viewer `json:"viewers"`
}

type Error struct {
	Type    string `json:"type"` // "error"
	Message string `json:"message"`
}

type Viewer struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	Status   string `json:"status"` // "watching", "buffering", "needsFile" or "disconnected" (set by the server only)
}

// Delivery is a message the Room wants sent. To is a viewerId, or "" for every Viewer
// except the one named by Except (if any).
type Delivery struct {
	To     string
	Except string
	Msg    any
}
