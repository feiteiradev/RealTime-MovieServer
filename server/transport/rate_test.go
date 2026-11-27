package transport_test

import "testing"

func TestRateAppliesToEveryViewer(t *testing.T) {
	srv, clock := startClockedServer(t, 1_000)
	ana, rui, anaID, ruiID := movieNight(t, srv)

	clock.ms.Store(2_000)
	rui.send(map[string]any{"type": "rate", "rate": 1.5})
	for _, c := range []*client{ana, rui} {
		expectState(t, c, ruiID, playbackState{Playing: false, Position: 0, Rate: 1.5, UpdatedAt: 2_000})
	}

	ana.send(map[string]any{"type": "play", "position": 10})
	ana.expect("state")
	rui.expect("state")

	// 4 s at 1.5x moves 6 s on; the new speed starts from there.
	clock.ms.Store(6_000)
	ana.send(map[string]any{"type": "rate", "rate": 0.5})
	for _, c := range []*client{ana, rui} {
		expectState(t, c, anaID, playbackState{Playing: true, Position: 16, Rate: 0.5, UpdatedAt: 6_000})
	}
}

func TestRatesOutsideThePresetsAreRejected(t *testing.T) {
	for name, rate := range map[string]any{"3x": 3, "0x": 0, "negative": -1, "1.1x": 1.1, "not a number": "fast"} {
		t.Run(name, func(t *testing.T) {
			srv, _ := startClockedServer(t, 1_000)
			ana, _, _, _ := movieNight(t, srv)

			ana.send(map[string]any{"type": "rate", "rate": rate})
			if m := ana.expect("error"); m.Message == "" {
				t.Fatal("error has no message")
			}

			w := dial(t, srv).join("Mia")
			if w.State == nil || w.State.Rate != 1 {
				t.Fatalf("state after rejected rate = %+v, want rate 1", w.State)
			}
		})
	}
}

func TestRateNeedsAMediaItem(t *testing.T) {
	srv, _ := startClockedServer(t, 1_000)
	ana := dial(t, srv)
	ana.join("Ana")
	ana.send(map[string]any{"type": "rate", "rate": 2})
	ana.expect("error")
}
