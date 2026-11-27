// Package room holds the single Room's state and rules. It knows nothing about the network:
// each command returns the Deliveries the transport should send. Not safe for concurrent use;
// the transport serialises calls.
package room

import (
	"crypto/rand"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"
)

const MaxNicknameLength = 32

type Room struct {
	viewers []Viewer // in join order
}

func New() *Room { return &Room{} }

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
		{To: v.ID, Msg: Welcome{Type: "welcome", ViewerID: v.ID, Viewers: r.Viewers()}},
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

func (r *Room) viewersMsg() Viewers { return Viewers{Type: "viewers", Viewers: r.Viewers()} }
