package room

// The WebSocket protocol: JSON objects with a "type" field, other fields flat beside it.
// Mirror any change here in web/src/protocol.ts.

// Client → server.

type Join struct {
	Nickname string `json:"nickname"`
}

// Server → client.

type Welcome struct {
	Type     string   `json:"type"` // "welcome"
	ViewerID string   `json:"viewerId"`
	Viewers  []Viewer `json:"viewers"`
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
	Status   string `json:"status"` // "watching" for now; later: buffering, needsFile, disconnected
}

// Delivery is a message the Room wants sent. To is a viewerId, or "" for every Viewer
// except the one named by Except (if any).
type Delivery struct {
	To     string
	Except string
	Msg    any
}
