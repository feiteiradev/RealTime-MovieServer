package transport_test

import (
	"net/http/httptest"
	"testing"
)

func TestSetMediaReachesEveryViewerPausedAtZero(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana, rui := dial(t, srv), dial(t, srv)
	anaID := ana.join("Ana").ViewerID
	rui.join("Rui")
	ana.expect("viewers")

	ana.send(map[string]any{"type": "setMedia", "mediaItem": movie})

	want := playbackState{
		MediaItem: &movie,
		Playing:   false, Position: 0, Rate: 1, UpdatedAt: 1_000,
	}
	for _, c := range []*client{ana, rui} {
		m := c.expect("state")
		if m.State == nil || !m.State.equal(want) || m.ByViewerID != anaID {
			t.Fatalf("state = %+v by %q, want %+v by Ana", m.State, m.ByViewerID, want)
		}
	}
}

// movieNight joins Ana and Rui and sets a Local File; it returns once both have seen the state.
func movieNight(t *testing.T, srv *httptest.Server) (ana, rui *client, anaID, ruiID string) {
	t.Helper()
	ana, rui = dial(t, srv), dial(t, srv)
	anaID = ana.join("Ana").ViewerID
	ruiID = rui.join("Rui").ViewerID
	ana.expect("viewers")
	ana.send(map[string]any{"type": "setMedia", "mediaItem": movie})
	ana.expect("state")
	rui.expect("state")
	return
}

func expectState(t *testing.T, c *client, by string, want playbackState) {
	t.Helper()
	m := c.expect("state")
	want.MediaItem = &movie
	if m.State == nil || !m.State.equal(want) || m.ByViewerID != by {
		t.Fatalf("state = %+v by %q, want %+v by %q", m.State, m.ByViewerID, want, by)
	}
}

func TestSharedControlsApplyToEveryViewer(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui, anaID, ruiID := movieNight(t, srv)

	clock.ms.Store(2_000)
	rui.send(map[string]any{"type": "play", "position": 0})
	for _, c := range []*client{ana, rui} {
		expectState(t, c, ruiID, playbackState{Playing: true, Position: 0, Rate: 1, UpdatedAt: 2_000})
	}

	clock.ms.Store(14_000)
	ana.send(map[string]any{"type": "pause", "position": 12})
	for _, c := range []*client{ana, rui} {
		expectState(t, c, anaID, playbackState{Playing: false, Position: 12, Rate: 1, UpdatedAt: 14_000})
	}

	clock.ms.Store(15_000)
	rui.send(map[string]any{"type": "seek", "position": 90.5})
	for _, c := range []*client{ana, rui} {
		expectState(t, c, ruiID, playbackState{Playing: false, Position: 90.5, Rate: 1, UpdatedAt: 15_000})
	}
}

func TestSeekWhilePlayingKeepsPlaying(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, _, anaID, _ := movieNight(t, srv)
	ana.send(map[string]any{"type": "play", "position": 0})
	ana.expect("state")

	clock.ms.Store(3_000)
	ana.send(map[string]any{"type": "seek", "position": 40})
	expectState(t, ana, anaID, playbackState{Playing: true, Position: 40, Rate: 1, UpdatedAt: 3_000})
}

func TestLateJoinerIsWelcomedWithTheCurrentState(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, _, _, _ := movieNight(t, srv)
	clock.ms.Store(5_000)
	ana.send(map[string]any{"type": "play", "position": 3})
	ana.expect("state")

	w := dial(t, srv).join("Mia")

	want := playbackState{
		MediaItem: &movie,
		Playing:   true, Position: 3, Rate: 1, UpdatedAt: 5_000,
	}
	if w.State == nil || !w.State.equal(want) {
		t.Fatalf("welcome state = %+v, want %+v", w.State, want)
	}
}

func TestPingIsAnsweredWithTheServerTime(t *testing.T) {
	srv, _ := startClockedServer(t, 42_000)
	ana := dial(t, srv)
	ana.join("Ana")

	ana.send(map[string]any{"type": "ping", "clientTime": 123.5})

	m := ana.expect("pong")
	if m.ClientTime != 123.5 || m.ServerTime != 42_000 {
		t.Fatalf("pong = {clientTime %v, serverTime %v}, want {123.5, 42000}", m.ClientTime, m.ServerTime)
	}
}

func TestEmptyRoomWelcomesWithNoMediaItem(t *testing.T) {
	srv, _ := startClockedServer(t, 7_000)
	w := dial(t, srv).join("Ana")
	if w.State == nil || !w.State.equal(playbackState{Rate: 1, UpdatedAt: 7_000}) {
		t.Fatalf("welcome state = %+v, want nothing set, paused at 0, rate 1", w.State)
	}
}

func TestInvalidCommandsAreRejectedAndChangeNothing(t *testing.T) {
	for name, msg := range map[string]map[string]any{
		"negative play":       {"type": "play", "position": -1},
		"negative pause":      {"type": "pause", "position": -0.5},
		"negative seek":       {"type": "seek", "position": -10},
		"non-number position": {"type": "seek", "position": "soon"},
		"unknown Source":      {"type": "setMedia", "mediaItem": map[string]any{"source": "netflix"}},
		"no Source":           {"type": "setMedia", "mediaItem": map[string]any{}},
		"Local File no name":  {"type": "setMedia", "mediaItem": map[string]any{"source": "local", "size": 1, "duration": 1}},
		"Local File negative size": {"type": "setMedia", "mediaItem": map[string]any{
			"source": "local", "name": "a.mp4", "size": -1, "duration": 1}},
		"Local File no duration": {"type": "setMedia", "mediaItem": map[string]any{
			"source": "local", "name": "a.mp4", "size": 1, "duration": 0}},
		"YouTube no videoId":    {"type": "setMedia", "mediaItem": map[string]any{"source": "youtube"}},
		"YouTube short videoId": {"type": "setMedia", "mediaItem": map[string]any{"source": "youtube", "videoId": "dQw4w9WgXc"}},
		"YouTube bad characters": {"type": "setMedia", "mediaItem": map[string]any{
			"source": "youtube", "videoId": "dQw4w9WgX/Q"}},
		"YouTube URL as videoId": {"type": "setMedia", "mediaItem": map[string]any{
			"source": "youtube", "videoId": "https://youtu.be/dQw4w9WgXcQ"}},
	} {
		t.Run(name, func(t *testing.T) {
			srv, _ := startClockedServer(t, 1_000)
			ana, _, _, _ := movieNight(t, srv)

			ana.send(msg)
			if m := ana.expect("error"); m.Message == "" {
				t.Fatal("error has no message")
			}

			w := dial(t, srv).join("Mia")
			want := playbackState{
				MediaItem: &movie,
				Rate:      1, UpdatedAt: 1_000,
			}
			if !w.State.equal(want) {
				t.Fatalf("state after rejected command = %+v, want unchanged %+v", w.State, want)
			}
		})
	}
}

func TestSharedControlsNeedAMediaItem(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	ana.join("Ana")
	ana.send(map[string]any{"type": "play", "position": 0})
	ana.expect("error")
}

func TestLastChangeReceivedWins(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana, rui, _, _ := movieNight(t, srv)

	rui.send(map[string]any{"type": "play", "position": 10})
	ana.send(map[string]any{"type": "pause", "position": 20})

	// Whichever the server received last, both Viewers see the same two states in the same order.
	a1, r1 := ana.expect("state"), rui.expect("state")
	a2, r2 := ana.expect("state"), rui.expect("state")
	if !a1.State.equal(*r1.State) || !a2.State.equal(*r2.State) || a2.ByViewerID != r2.ByViewerID {
		t.Fatalf("Viewers disagree: Ana %+v then %+v, Rui %+v then %+v", a1.State, a2.State, r1.State, r2.State)
	}
	if a1.State.Playing == a2.State.Playing {
		t.Fatalf("both states have playing=%v; want one play and one pause", a1.State.Playing)
	}
}

func TestSetMediaAcceptsAYouTubeVideo(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui, anaID, _ := movieNight(t, srv)
	ana.send(map[string]any{"type": "play", "position": 30})
	ana.expect("state")
	rui.expect("state")
	clock.ms.Store(5_000)

	ana.send(map[string]any{"type": "setMedia", "mediaItem": map[string]any{"source": "youtube", "videoId": "dQw4w9WgXcQ"}})

	want := playbackState{MediaItem: &mediaItem{Source: "youtube", VideoID: "dQw4w9WgXcQ"}, Rate: 1, UpdatedAt: 5_000}
	for _, c := range []*client{ana, rui} {
		m := c.expect("state")
		if m.State == nil || !m.State.equal(want) || m.ByViewerID != anaID {
			t.Fatalf("state = %+v by %q, want %+v by Ana", m.State, m.ByViewerID, want)
		}
	}
}
