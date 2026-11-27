package transport_test

import (
	"fmt"
	"testing"

	"github.com/coder/websocket"
)

type feedEntry struct {
	At        int64      `json:"at"`
	Nickname  string     `json:"nickname"`
	Action    string     `json:"action"`
	Position  *float64   `json:"position"`
	MediaItem *mediaItem `json:"mediaItem"`
	Rate      float64    `json:"rate"`
}

// describe renders an entry compactly so expectations read like the Activity Feed.
func (e feedEntry) describe() string {
	s := fmt.Sprintf("%d %s %s", e.At, e.Nickname, e.Action)
	if e.Position != nil {
		s += fmt.Sprintf(" %v", *e.Position)
	}
	if e.MediaItem != nil {
		s += " " + e.MediaItem.Name
	}
	if e.Rate != 0 {
		s += fmt.Sprintf(" %v", e.Rate)
	}
	return s
}

func expectFeed(t *testing.T, c *client, want string) {
	t.Helper()
	m := c.expect("feed")
	if m.Entry == nil || m.Entry.describe() != want {
		t.Fatalf("feed entry = %+v, want %q", m.Entry, want)
	}
}

func TestEveryActionIsRecordedInTheActivityFeed(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui := dial(t, srv), dial(t, srv)
	ana.join("Ana")
	clock.ms.Store(2_000)
	rui.join("Rui")
	ana.expect("viewers")
	expectFeed(t, ana, "2000 Rui join")

	clock.ms.Store(3_000)
	ana.send(map[string]any{"type": "setMedia", "mediaItem": localFile("movie.mp4")})
	for _, c := range []*client{ana, rui} {
		c.expect("state")
		expectFeed(t, c, "3000 Ana setMedia movie.mp4")
	}

	clock.ms.Store(4_000)
	for _, step := range []struct {
		by   *client
		msg  map[string]any
		want string
	}{
		{rui, map[string]any{"type": "play", "position": 0}, "4000 Rui play 0"},
		{ana, map[string]any{"type": "pause", "position": 724}, "4000 Ana pause 724"},
		{rui, map[string]any{"type": "seek", "position": 2710.5}, "4000 Rui seek 2710.5"},
		{ana, map[string]any{"type": "rate", "rate": 1.5}, "4000 Ana rate 1.5"},
	} {
		step.by.send(step.msg)
		for _, c := range []*client{ana, rui} {
			c.expect("state")
			expectFeed(t, c, step.want)
		}
	}

	clock.ms.Store(5_000)
	rui.conn.Close(websocket.StatusNormalClosure, "bye")
	ana.expect("viewers")
	expectFeed(t, ana, "5000 Rui leave")
}

func TestRejectedCommandsAreNotRecorded(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	ana.join("Ana")
	ana.send(map[string]any{"type": "play", "position": 0}) // no Media Item yet
	ana.expect("error")

	w := dial(t, srv).join("Mia")
	if len(w.Feed) != 2 || w.Feed[0].describe() != "1000 Ana join" || w.Feed[1].describe() != "1000 Mia join" {
		t.Fatalf("welcome feed = %+v, want just Ana's and Mia's joins", w.Feed)
	}
}

func TestLateJoinerIsWelcomedWithTheLast50Entries(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana, _, _, _ := movieNight(t, srv) // 3 entries: Ana join, Rui join, Ana setMedia
	for i := range 60 {
		ana.send(map[string]any{"type": "seek", "position": i})
		ana.expect("state")
	}

	w := dial(t, srv).join("Mia")

	if len(w.Feed) != 50 {
		t.Fatalf("welcome feed has %d entries, want 50", len(w.Feed))
	}
	// Oldest first: seeks to 11..59, then Mia's own join.
	if got := w.Feed[0].describe(); got != "1000 Ana seek 11" {
		t.Fatalf("oldest entry = %q, want Ana's seek to 11", got)
	}
	if got := w.Feed[49].describe(); got != "1000 Mia join" {
		t.Fatalf("newest entry = %q, want Mia's join", got)
	}
}
