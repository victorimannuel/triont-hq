package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// The countdown itself lives in the browser, which is where it can be watched.
// What lives here is only the alarm: the moment it is due, so the phone can be
// woken even when nothing is open to watch anything.
//
// Both ends ring. A page that is still open rings locally the instant it hits
// zero, and the push arrives from here at the same moment — they carry the same
// notification tag, so the second replaces the first instead of stacking.

// Must match the two halves the browser uses, or a focus run would change
// length depending on whether the app happened to be open.
const (
	focusWork  = 25 * time.Minute
	focusBreak = 5 * time.Minute
	// How closely the loop chases the clock. A countdown that lands a minute
	// late is not a timer, and an empty indexed query costs nothing.
	timerTick = 2 * time.Second
)

type alarmRequest struct {
	// Epoch milliseconds, which is what the browser already holds.
	FiresAt int64  `json:"fires_at"`
	Label   string `json:"label"`
	Kind    string `json:"kind"`
	Round   int    `json:"round"`
}

func (s *Server) handleSetAlarm(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)

	var in alarmRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "alarm timer nggak kebaca")
		return
	}
	if in.FiresAt <= 0 {
		fail(w, http.StatusBadRequest, "alarm timer butuh waktu selesai")
		return
	}
	if in.Round < 1 {
		in.Round = 1
	}

	err := s.store.SetAlarm(r.Context(), store.TimerAlarm{
		UserID:  user.ID,
		FiresAt: time.UnixMilli(in.FiresAt),
		Label:   strings.TrimSpace(in.Label),
		Kind:    alarmKind(in.Kind),
		Round:   in.Round,
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleClearAlarm(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	if err := s.store.ClearAlarm(r.Context(), user.ID); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func alarmKind(kind string) string {
	switch kind {
	case "work", "break":
		return kind
	default:
		return "plain"
	}
}

// RunTimers rings whatever has come due. It is a separate loop from the daily
// reminder because the two want opposite things from a ticker: one wants to
// wake rarely, this one wants to be close to the second.
func (s *Server) RunTimers(ctx context.Context) {
	ticker := time.NewTicker(timerTick)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.fireDueAlarms(ctx)
		}
	}
}

func (s *Server) fireDueAlarms(ctx context.Context) {
	due, err := s.store.ClaimDueAlarms(ctx, time.Now())
	if err != nil {
		s.log.Error("timer alarms", "err", err)
		return
	}

	for _, alarm := range due {
		subs, err := s.store.Subscriptions(ctx, alarm.UserID)
		if err != nil {
			s.log.Error("timer subscriptions", "err", err)
			continue
		}
		if len(subs) > 0 {
			s.pushEach(ctx, subs, func(lang string) payload {
				title, body := timerText(lang, alarm)
				return payload{
					Title: title,
					Body:  body,
					URL:   "/timer",
					// The same tag the page uses for its own alarm, so whichever
					// arrives second replaces the first rather than doubling it.
					Tag: "hq-timer",
				}
			})
		}

		// A focus run keeps going with the app shut, which is the whole reason
		// the halves are described here as well as in the browser.
		if next, ok := nextFocus(alarm); ok {
			if err := s.store.SetAlarm(ctx, next); err != nil {
				s.log.Error("timer next half", "err", err)
			}
		}
		s.log.Info("timer rang", "kind", alarm.Kind, "round", alarm.Round, "devices", len(subs))
	}
}

// timerText is what the finished run says, in the language of the device it is
// about to land on.
func timerText(lang string, alarm store.TimerAlarm) (string, string) {
	switch alarm.Kind {
	case "work":
		return textTimerToBreak(lang, alarm.Round)
	case "break":
		return textTimerToWork(lang)
	default:
		return textTimerDone(lang, alarm.Label)
	}
}

// nextFocus arms the other half of a focus run. A plain countdown has no next.
func nextFocus(done store.TimerAlarm) (store.TimerAlarm, bool) {
	switch done.Kind {
	case "work":
		return store.TimerAlarm{
			UserID:  done.UserID,
			FiresAt: time.Now().Add(focusBreak),
			Kind:    "break",
			Round:   done.Round,
		}, true
	case "break":
		return store.TimerAlarm{
			UserID:  done.UserID,
			FiresAt: time.Now().Add(focusWork),
			Kind:    "work",
			Round:   done.Round + 1,
		}, true
	default:
		return store.TimerAlarm{}, false
	}
}
