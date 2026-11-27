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

	// The duplicates changed nothing, so nobody hears about them: Ana's player reports its
	// end a little earlier, and a pause within a second of where the Room is paused is the same.
	clock.ms.Store(601_600)
	ana.send(map[string]any{"type": "pause", "position": 600.5})
	ana.send(map[string]any{"type": "pause", "position": 599.7})
	ana.send(map[string]any{"type": "ping", "clientTime": 1})
	ana.expect("pong") // anything else (feed aside) means the Room spoke up
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
	back.send(map[string]any{"type": "join", "nickname": "Rui", "rejoinToken": rui.rejoinToken})
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
	ana.expect("pong") // anything else (feed aside) means the Room spoke up

	// The blip left no trace in the Activity Feed: no leave, no second join.
	for _, e := range dial(t, srv).join("Mia").Feed {
		if e.Nickname == "Rui" && e.Action != "join" {
			t.Fatalf("feed has %q after a reconnect within the grace period", e.describe())
		}
	}
}

func TestRemovalAfterTheGracePeriodIsOneLeaveInTheFeed(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui := dial(t, srv), dial(t, srv)
	ana.join("Ana")
	rui.join("Rui")
	ana.expect("viewers")
	expectFeed(t, ana, "1000 Rui join")

	rui.conn.CloseNow()
	ana.expect("viewers")
	clock.ms.Store(31_000)
	ana.expect("viewers")
	expectFeed(t, ana, "31000 Rui leave")
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
	back.send(map[string]any{"type": "join", "nickname": "Rui", "rejoinToken": rui.rejoinToken})
	if w := back.expect("welcome"); w.ViewerID != ruiID || w.RejoinToken != rui.rejoinToken {
		t.Fatalf("rejoined as %q, want %q", w.ViewerID, ruiID)
	}
	if got := statuses(ana.expect("viewers")); got != "Ana:watching,Rui:watching" {
		t.Fatalf("Ana sees %v", got)
	}

	// The old connection closing later doesn't mark the reclaimed Viewer disconnected.
	rui.conn.CloseNow()
	time.Sleep(100 * time.Millisecond)
	ana.send(map[string]any{"type": "ping", "clientTime": 1})
	ana.expect("pong") // anything else (feed aside) means the Room spoke up
}

func TestRejoinWithAnUnknownTokenOrAnotherNicknameJoinsAfresh(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	anaID := ana.join("Ana").ViewerID

	// After a restart the old token means nothing: a fresh Viewer in a fresh Room.
	rui := dial(t, srv)
	rui.send(map[string]any{"type": "join", "nickname": "Rui", "rejoinToken": "GONE"})
	if w := rui.expect("welcome"); w.ViewerID == anaID || w.RejoinToken == "GONE" {
		t.Fatalf("got viewerId %q, token %q, want fresh ones", w.ViewerID, w.RejoinToken)
	}
	ana.expect("viewers")

	// Another Viewer's token under a different Nickname doesn't take over their entry.
	mia := dial(t, srv)
	mia.send(map[string]any{"type": "join", "nickname": "Mia", "rejoinToken": ana.rejoinToken})
	w := mia.expect("welcome")
	if w.ViewerID == anaID {
		t.Fatal("Mia took over Ana's presence entry")
	}
	if got := statuses(w); got != "Ana:watching,Rui:watching,Mia:watching" {
		t.Fatalf("viewers = %v", got)
	}
}

func TestAnotherViewersPublicIDCannotReclaimTheirEntry(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	anaID := ana.join("Ana").ViewerID

	// Everyone sees Ana's viewerId in the presence list; posing as her with it must not work.
	impostor := dial(t, srv)
	impostor.send(map[string]any{"type": "join", "nickname": "Ana", "rejoinToken": anaID})
	w := impostor.expect("welcome")
	if w.ViewerID == anaID || w.RejoinToken == ana.rejoinToken {
		t.Fatal("a join with Ana's public viewerId reclaimed her entry")
	}
	if got := statuses(w); got != "Ana:watching,Ana:watching" {
		t.Fatalf("viewers = %v, want Ana and a second, separate Ana", got)
	}
}
