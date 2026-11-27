// Package transport is the thin network layer: it serves the frontend and carries the
// protocol between WebSocket connections and the Room.
package transport

import (
	"context"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"sync"
	"time"

	"campfire/room"

	"github.com/coder/websocket"
)

// Handler serves the static frontend at / and the Room's WebSocket at /ws.
func Handler(r *room.Room, static fs.FS) http.Handler {
	h := &hub{room: r, conns: map[string]*websocket.Conn{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.serveWS)
	files := http.FileServerFS(static)
	mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin") // YouTube embeds fail with error 153 without it
		files.ServeHTTP(w, req)
	})
	return mux
}

type hub struct {
	mu    sync.Mutex // guards room and conns, and orders deliveries
	room  *room.Room
	conns map[string]*websocket.Conn // by viewerId
}

func (h *hub) serveWS(w http.ResponseWriter, req *http.Request) {
	// Default options reject cross-origin requests with 403.
	conn, err := websocket.Accept(w, req, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()

	var viewerID string
	defer func() {
		if viewerID == "" {
			return
		}
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.conns, viewerID)
		h.deliver(h.room.Leave(viewerID))
	}()

	for {
		_, data, err := conn.Read(req.Context())
		if err != nil {
			return
		}
		var envelope struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(data, &envelope) != nil {
			sendError(conn, "Message is not valid JSON")
			continue
		}
		if viewerID == "" && envelope.Type != "join" {
			sendError(conn, "Join the Room first")
			continue
		}
		h.mu.Lock()
		switch envelope.Type {
		case "join":
			var m room.Join
			if viewerID != "" {
				sendError(conn, "Already joined")
			} else if json.Unmarshal(data, &m) != nil {
				sendError(conn, "Invalid join message")
			} else if id, out, err := h.room.Join(m.Nickname); err != nil {
				sendError(conn, err.Error())
			} else {
				viewerID = id
				h.conns[id] = conn
				h.deliver(out)
			}
		// One case per client message: decode its body from protocol.go, call the Room, deliver.
		case "play":
			if m, ok := decode[room.Position](conn, data); ok {
				h.deliver(h.room.Play(viewerID, m.Position))
			}
		case "pause":
			if m, ok := decode[room.Position](conn, data); ok {
				h.deliver(h.room.Pause(viewerID, m.Position))
			}
		case "seek":
			if m, ok := decode[room.Position](conn, data); ok {
				h.deliver(h.room.Seek(viewerID, m.Position))
			}
		case "setMedia":
			if m, ok := decode[room.SetMedia](conn, data); ok {
				h.deliver(h.room.SetMedia(viewerID, m.MediaItem))
			}
		case "rate":
			if m, ok := decode[room.Rate](conn, data); ok {
				h.deliver(h.room.SetRate(viewerID, m.Rate))
			}
		case "ping":
			if m, ok := decode[room.Ping](conn, data); ok {
				h.deliver(h.room.Ping(viewerID, m.ClientTime))
			}
		default:
			sendError(conn, "Unknown message type "+envelope.Type)
		}
		h.mu.Unlock()
	}
}

// deliver sends the Room's messages. Caller holds h.mu.
// shortcut: writes inline under the lock, so one stalled Viewer delays others up to the write
// timeout; fine for ~10 Viewers, move to per-connection send queues if that bites.
func (h *hub) deliver(out []room.Delivery) {
	for _, d := range out {
		if d.To != "" {
			if c := h.conns[d.To]; c != nil {
				write(c, d.Msg)
			}
			continue
		}
		for id, c := range h.conns {
			if id != d.Except {
				write(c, d.Msg)
			}
		}
	}
}

// decode reads a message body, or tells the sender it was malformed.
func decode[T any](c *websocket.Conn, data []byte) (T, bool) {
	var m T
	if err := json.Unmarshal(data, &m); err != nil {
		sendError(c, "Invalid message: "+err.Error())
		return m, false
	}
	return m, true
}

func sendError(c *websocket.Conn, message string) {
	write(c, room.Error{Type: "error", Message: message})
}

func write(c *websocket.Conn, msg any) {
	b, err := json.Marshal(msg)
	if err != nil {
		log.Printf("encode %T: %v", msg, err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c.Write(ctx, websocket.MessageText, b) // a failed write surfaces as a read error in that Viewer's loop
}
