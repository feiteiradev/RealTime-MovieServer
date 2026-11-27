package transport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"campfire/room"
	"campfire/transport"

	"github.com/coder/websocket"
)

func startServer(t *testing.T) *httptest.Server {
	t.Helper()
	static := fstest.MapFS{"index.html": {Data: []byte("<h1>Campfire</h1>")}}
	srv := httptest.NewServer(transport.Handler(room.New(time.Now), static))
	t.Cleanup(srv.Close)
	return srv
}

type client struct {
	t    *testing.T
	conn *websocket.Conn
}

func dial(t *testing.T, srv *httptest.Server) *client {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	return &client{t: t, conn: conn}
}

func (c *client) send(msg map[string]any) {
	c.t.Helper()
	b, _ := json.Marshal(msg)
	if err := c.conn.Write(context.Background(), websocket.MessageText, b); err != nil {
		c.t.Fatalf("write: %v", err)
	}
}

type message struct {
	Type       string         `json:"type"`
	ViewerID   string         `json:"viewerId"`
	Message    string         `json:"message"`
	State      *playbackState `json:"state"`
	ByViewerID string         `json:"byViewerId"`
	ClientTime float64        `json:"clientTime"`
	ServerTime int64          `json:"serverTime"`
	Viewers    []struct {
		ID       string `json:"id"`
		Nickname string `json:"nickname"`
		Status   string `json:"status"`
	} `json:"viewers"`
}

type mediaItem struct {
	Source   string  `json:"source"`
	Name     string  `json:"name"`
	Size     int64   `json:"size"`
	Duration float64 `json:"duration"`
}

type playbackState struct {
	MediaItem *mediaItem `json:"mediaItem"`
	Playing   bool       `json:"playing"`
	Position  float64    `json:"position"`
	Rate      float64    `json:"rate"`
	UpdatedAt int64      `json:"updatedAt"`
}

func (s playbackState) equal(o playbackState) bool {
	sameItem := (s.MediaItem == nil) == (o.MediaItem == nil) && (s.MediaItem == nil || *s.MediaItem == *o.MediaItem)
	return sameItem && s.Playing == o.Playing && s.Position == o.Position && s.Rate == o.Rate && s.UpdatedAt == o.UpdatedAt
}

func (c *client) read() message {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, b, err := c.conn.Read(ctx)
	if err != nil {
		c.t.Fatalf("read: %v", err)
	}
	var m message
	if err := json.Unmarshal(b, &m); err != nil {
		c.t.Fatalf("decode %s: %v", b, err)
	}
	return m
}

func (c *client) expect(typ string) message {
	c.t.Helper()
	m := c.read()
	if m.Type != typ {
		c.t.Fatalf("got %q message %+v, want %q", m.Type, m, typ)
	}
	return m
}

func (c *client) join(nickname string) message {
	c.t.Helper()
	c.send(map[string]any{"type": "join", "nickname": nickname})
	return c.expect("welcome")
}

func nicknames(m message) []string {
	var out []string
	for _, v := range m.Viewers {
		out = append(out, v.Nickname)
	}
	return out
}

// statuses renders the presence list as "Nickname:status,...".
func statuses(m message) string {
	var out []string
	for _, v := range m.Viewers {
		out = append(out, v.Nickname+":"+v.Status)
	}
	return strings.Join(out, ",")
}

func TestViewerJoinsAndIsWelcomed(t *testing.T) {
	srv := startServer(t)
	ana := dial(t, srv)

	w := ana.join("  Ana  ")

	if w.ViewerID == "" {
		t.Fatal("welcome has no viewerId")
	}
	if len(w.Viewers) != 1 || w.Viewers[0].ID != w.ViewerID || w.Viewers[0].Nickname != "Ana" {
		t.Fatalf("welcome viewers = %+v, want just Ana (trimmed) with her viewerId", w.Viewers)
	}
}

func TestPresenceUpdatesWhenViewersJoinAndLeave(t *testing.T) {
	srv := startServer(t)
	ana, rui := dial(t, srv), dial(t, srv)
	ana.join("Ana")

	w := rui.join("Rui")
	if got := nicknames(w); strings.Join(got, ",") != "Ana,Rui" {
		t.Fatalf("Rui's welcome viewers = %v, want Ana,Rui", got)
	}
	if got := nicknames(ana.expect("viewers")); strings.Join(got, ",") != "Ana,Rui" {
		t.Fatalf("Ana sees %v after Rui joins, want Ana,Rui", got)
	}

	rui.conn.Close(websocket.StatusNormalClosure, "bye")
	if got := statuses(ana.expect("viewers")); got != "Ana:watching" {
		t.Fatalf("Ana sees %v after Rui closes the Room, want just Ana", got)
	}
}

func TestDuplicateNicknamesAreDistinctViewers(t *testing.T) {
	srv := startServer(t)
	a1, a2 := dial(t, srv), dial(t, srv)
	first := a1.join("Ana")
	second := a2.join("Ana")

	if first.ViewerID == second.ViewerID {
		t.Fatal("two Viewers named Ana share a viewerId")
	}
	if len(second.Viewers) != 2 {
		t.Fatalf("viewers = %+v, want both Anas", second.Viewers)
	}
}

func TestInvalidNicknameIsRejected(t *testing.T) {
	for name, nickname := range map[string]string{
		"empty":       "",
		"only spaces": "   ",
		"too long":    strings.Repeat("a", 33),
	} {
		t.Run(name, func(t *testing.T) {
			srv := startServer(t)
			watcher := dial(t, srv)
			watcher.join("Mia")
			bad := dial(t, srv)

			bad.send(map[string]any{"type": "join", "nickname": nickname})
			if m := bad.expect("error"); m.Message == "" {
				t.Fatal("error has no message")
			}

			// The rejected Viewer is not in the Room: a valid join afterwards sees only Mia and itself.
			w := bad.join("Rui")
			if got := strings.Join(nicknames(w), ","); got != "Mia,Rui" {
				t.Fatalf("viewers = %v, want Mia,Rui", got)
			}
		})
	}
}

func TestNicknameOf32CharactersIsAccepted(t *testing.T) {
	srv := startServer(t)
	dial(t, srv).join(strings.Repeat("a", 32))
}

func TestCrossOriginWebSocketIsRefused(t *testing.T) {
	srv := startServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {"https://evil.example"}},
	})
	if err == nil {
		t.Fatal("cross-origin WebSocket was accepted")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("response = %v, want 403", resp)
	}
}

func TestServesTheFrontend(t *testing.T) {
	srv := startServer(t)
	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET / = %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Referrer-Policy"); got != "strict-origin-when-cross-origin" {
		t.Fatalf("Referrer-Policy = %q", got)
	}
}
