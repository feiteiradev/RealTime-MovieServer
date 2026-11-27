// Package room holds the single Room's state and rules. It knows nothing about the network:
// each command returns the Deliveries the transport should send. Not safe for concurrent use;
// the transport serialises calls.
package room

import (
	"crypto/rand"
	"errors"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

const MaxNicknameLength = 32

type Room struct {
	now     func() time.Time
	viewers []Viewer // in join order
	state   PlaybackState
}

// New makes an empty Room. now is the server clock (time.Now outside tests).
func New(now func() time.Time) *Room {
	return &Room{now: now, state: PlaybackState{Rate: 1, UpdatedAt: now().UnixMilli()}}
}

// Join adds a Viewer. On error the Room is unchanged and nothing is sent.
func (r *Room) Join(nickname string) (viewerID string, out []Delivery, err error) {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return "", nil, errors.New("Nickname can't be empty")
	}
	if utf8.RuneCountInString(nickname) > MaxNicknameLength {
		return "", nil, errors.New("Nickname must be at most 32 characters")
	}
	v := Viewer{ID: rand.Text(), Nickname: nickname, Status: "watching"}
	r.viewers = append(r.viewers, v)
	return v.ID, []Delivery{
		{To: v.ID, Msg: Welcome{Type: "welcome", ViewerID: v.ID, State: r.state, Viewers: r.Viewers()}},
		{Except: v.ID, Msg: r.viewersMsg()},
	}, nil
}

// Leave removes a Viewer. Unknown ids are ignored.
func (r *Room) Leave(viewerID string) []Delivery {
	n := len(r.viewers)
	r.viewers = slices.DeleteFunc(r.viewers, func(v Viewer) bool { return v.ID == viewerID })
	if len(r.viewers) == n {
		return nil
	}
	return []Delivery{{Msg: r.viewersMsg()}}
}

func (r *Room) Viewers() []Viewer { return slices.Clone(r.viewers) }

// SetStatus records a Viewer's own status and tells everyone. Clients may not claim
// "disconnected"; the server sets that.
func (r *Room) SetStatus(viewerID, status string) []Delivery {
	if status != "watching" && status != "buffering" && status != "needsFile" {
		return reject(viewerID, errors.New("Status must be watching, buffering or needsFile"))
	}
	i := slices.IndexFunc(r.viewers, func(v Viewer) bool { return v.ID == viewerID })
	if i < 0 {
		return nil
	}
	r.viewers[i].Status = status
	return []Delivery{{Msg: r.viewersMsg()}}
}

func (r *Room) viewersMsg() Viewers { return Viewers{Type: "viewers", Viewers: r.Viewers()} }

// Shared Controls and setMedia: each returns the new state for everyone, or, if the
// command is invalid, an error for its sender only and the state is unchanged.

// SetMedia replaces the Media Item and resets to paused at 0, speed 1.
func (r *Room) SetMedia(viewerID string, item MediaItem) []Delivery {
	if err := validMediaItem(item); err != nil {
		return reject(viewerID, err)
	}
	return r.update(viewerID, PlaybackState{MediaItem: &item, Rate: 1})
}

func (r *Room) Play(viewerID string, position float64) []Delivery {
	return r.control(viewerID, position, true)
}

func (r *Room) Pause(viewerID string, position float64) []Delivery {
	return r.control(viewerID, position, false)
}

// Seek moves the position and keeps playing or paused as it was.
func (r *Room) Seek(viewerID string, position float64) []Delivery {
	return r.control(viewerID, position, r.state.Playing)
}

func (r *Room) control(viewerID string, position float64, playing bool) []Delivery {
	if r.state.MediaItem == nil {
		return reject(viewerID, errors.New("Set a Media Item first"))
	}
	if err := validPosition(position); err != nil {
		return reject(viewerID, err)
	}
	s := r.state
	s.Position, s.Playing = position, playing
	return r.update(viewerID, s)
}

func (r *Room) Ping(viewerID string, clientTime float64) []Delivery {
	return []Delivery{{To: viewerID, Msg: Pong{Type: "pong", ClientTime: clientTime, ServerTime: r.now().UnixMilli()}}}
}

// update replaces the Playback State with a fresh updatedAt and tells everyone.
func (r *Room) update(viewerID string, s PlaybackState) []Delivery {
	s.UpdatedAt = r.now().UnixMilli()
	r.state = s
	return []Delivery{{Msg: State{Type: "state", State: s, ByViewerID: viewerID}}}
}

func reject(viewerID string, err error) []Delivery {
	return []Delivery{{To: viewerID, Msg: Error{Type: "error", Message: err.Error()}}}
}

func validMediaItem(item MediaItem) error {
	switch item.Source {
	case "local":
		if strings.TrimSpace(item.Name) == "" || item.Size < 0 || validPosition(item.Duration) != nil || item.Duration == 0 {
			return errors.New("A Local File needs a name, a size and a duration")
		}
		return nil
	default:
		return errors.New("Unknown Source " + item.Source)
	}
}

func validPosition(seconds float64) error {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
		return errors.New("Position must be a finite number of seconds, 0 or more")
	}
	return nil
}
