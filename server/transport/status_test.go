package transport_test

import "testing"

func statusOf(m message, viewerID string) string {
	for _, v := range m.Viewers {
		if v.ID == viewerID {
			return v.Status
		}
	}
	return ""
}

func TestViewersStartWatching(t *testing.T) {
	srv := startServer(t)
	w := dial(t, srv).join("Ana")
	if got := statusOf(w, w.ViewerID); got != "watching" {
		t.Fatalf("status = %q, want watching", got)
	}
}

func TestStatusUpdatesReachEveryViewer(t *testing.T) {
	srv := startServer(t)
	ana, rui := dial(t, srv), dial(t, srv)
	ana.join("Ana")
	ruiID := rui.join("Rui").ViewerID
	ana.expect("viewers")

	for _, status := range []string{"needsFile", "buffering", "watching"} {
		rui.send(map[string]any{"type": "status", "status": status})
		for _, c := range []*client{ana, rui} {
			if got := statusOf(c.expect("viewers"), ruiID); got != status {
				t.Fatalf("Rui's status = %q, want %q", got, status)
			}
		}
	}
}

func TestInvalidStatusIsRejected(t *testing.T) {
	srv := startServer(t)
	ana := dial(t, srv)
	ana.join("Ana")

	// "disconnected" is the server's to set, never a client's.
	for _, status := range []string{"disconnected", "asleep", ""} {
		ana.send(map[string]any{"type": "status", "status": status})
		if m := ana.expect("error"); m.Message == "" {
			t.Fatalf("status %q: error has no message", status)
		}
	}
	ana.send(map[string]any{"type": "status", "status": "buffering"})
	ana.expect("viewers") // nothing was left queued, and the Viewer can still update
}
