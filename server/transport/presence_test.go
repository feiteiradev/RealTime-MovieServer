package transport_test

import (
	"testing"
	"time"

	"campfire/room"
)

func TestDisconnectedViewerIsRemovedAfterTheGracePeriod(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui := dial(t, srv), dial(t, srv)
	ana.join("Ana")
	rui.join("Rui")
	ana.expect("viewers")

	rui.conn.CloseNow()
	if got := statuses(ana.expect("viewers")); got != "Ana:watching,Rui:disconnected" {
		t.Fatalf("after the drop Ana sees %v", got)
	}

	clock.ms.Store(1_000 + room.DisconnectGrace.Milliseconds())
	if got := statuses(ana.expect("viewers")); got != "Ana:watching" {
		t.Fatalf("after the grace period Ana sees %v, want just Ana", got)
	}
}

func TestEveryPlayerReportingTheEndPausesOnceAtTheEnd(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui, _, ruiID := movieNight(t, srv)
	ana.send(map[string]any{"type": "play", "position": 0})
	ana.expect("state")
	rui.expect("state")

	// Each player that reaches the end sends pause at the end position.
	clock.ms.Store(601_500)
	rui.send(map[string]any{"type": "pause", "position": 600.5})
	for _, c := range []*client{ana, rui} {
		expectState(t, c, ruiID, playbackState{Playing: false, Position: 600.5, Rate: 1, UpdatedAt: 601_500})
	}

	// The duplicate changed nothing, so nobody hears about it.
	clock.ms.Store(601_600)
	ana.send(map[string]any{"type": "pause", "position": 600.5})
	ana.send(map[string]any{"type": "ping", "clientTime": 1})
	if m := ana.read(); m.Type != "pong" {
		t.Fatalf("got %q %+v after a duplicate end report, want only the pong", m.Type, m)
	}
}

func TestReconnectingWithinTheGracePeriodReusesThePresenceEntry(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui, _, ruiID := movieNight(t, srv)
	ana.send(map[string]any{"type": "play", "position": 5})
	ana.expect("state")
	rui.expect("state")

	rui.conn.CloseNow()
	ana.expect("viewers")
	clock.ms.Store(1_000 + room.DisconnectGrace.Milliseconds() - 1)

	back := dial(t, srv)
	back.send(map[string]any{"type": "join", "nickname": "Rui", "viewerId": ruiID})
	w := back.expect("welcome")
	if w.ViewerID != ruiID {
		t.Fatalf("rejoined as %q, want the same viewerId %q", w.ViewerID, ruiID)
	}
	if w.State == nil || !w.State.Playing || w.State.Position != 5 {
		t.Fatalf("rejoin welcome state = %+v, want the Room's current state", w.State)
	}
	if got := statuses(ana.expect("viewers")); got != "Ana:watching,Rui:watching" {
		t.Fatalf("after the rejoin Ana sees %v", got)
	}

	// The reclaimed entry is off the removal clock: a sweep long after the grace changes nothing.
	clock.ms.Store(1_000 + 2*room.DisconnectGrace.Milliseconds())
	time.Sleep(time.Second)
	ana.send(map[string]any{"type": "ping", "clientTime": 1})
	if m := ana.read(); m.Type != "pong" {
		t.Fatalf("got %q %+v, want pong (no removal)", m.Type, m)
	}
}

func TestRejoiningOnAFreshConnectionTakesOverTheOldOne(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	ana.join("Ana")
	rui := dial(t, srv)
	ruiID := rui.join("Rui").ViewerID
	ana.expect("viewers")

	// The server hasn't noticed Rui's old connection is dead yet.
	back := dial(t, srv)
	back.send(map[string]any{"type": "join", "nickname": "Rui", "viewerId": ruiID})
	if w := back.expect("welcome"); w.ViewerID != ruiID {
		t.Fatalf("rejoined as %q, want %q", w.ViewerID, ruiID)
	}
	if got := statuses(ana.expect("viewers")); got != "Ana:watching,Rui:watching" {
		t.Fatalf("Ana sees %v", got)
	}

	// The old connection closing later doesn't mark the reclaimed Viewer disconnected.
	rui.conn.CloseNow()
	time.Sleep(100 * time.Millisecond)
	ana.send(map[string]any{"type": "ping", "clientTime": 1})
	if m := ana.read(); m.Type != "pong" {
		t.Fatalf("got %q %+v, want pong", m.Type, m)
	}
}

func TestRejoinWithAnUnknownViewerIDOrAnotherNicknameJoinsAfresh(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	anaID := ana.join("Ana").ViewerID

	// After a restart the old viewerId means nothing: a fresh Viewer in a fresh Room.
	rui := dial(t, srv)
	rui.send(map[string]any{"type": "join", "nickname": "Rui", "viewerId": "GONE"})
	if w := rui.expect("welcome"); w.ViewerID == "GONE" || w.ViewerID == anaID {
		t.Fatalf("got viewerId %q, want a fresh one", w.ViewerID)
	}
	ana.expect("viewers")

	// Another Viewer's id under a different Nickname doesn't take over their entry.
	mia := dial(t, srv)
	mia.send(map[string]any{"type": "join", "nickname": "Mia", "viewerId": anaID})
	w := mia.expect("welcome")
	if w.ViewerID == anaID {
		t.Fatal("Mia took over Ana's presence entry")
	}
	if got := statuses(w); got != "Ana:watching,Rui:watching,Mia:watching" {
		t.Fatalf("viewers = %v", got)
	}
}
