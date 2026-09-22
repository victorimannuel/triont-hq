package api

import (
	"context"
	"crypto/subtle"
	"net/http"
	"time"
)

/*
The home-screen widget's one call: a small, glanceable summary.

It reads with a bearer token: the phone's own session, which the app stores
when you sign in, or the MCP token for anything else that lives outside a
browser. Everything here is already computed for the home page; this only
trims it down to what fits in a widget and shapes the dates so the phone does
no arithmetic.
*/

type widgetEntry struct {
	Label string `json:"label"`
	Kind  string `json:"kind"`
	Date  string `json:"date"`
	// Whole days from today; negative once it has gone by.
	Days int    `json:"days"`
	URL  string `json:"url"`
}

type widgetClock struct {
	Project   string    `json:"project"`
	Part      string    `json:"part"`
	StartedAt time.Time `json:"started_at"`
	Seconds   int64     `json:"seconds"`
}

type widgetSummary struct {
	HabitsDone  int      `json:"habits_done"`
	HabitsTotal int      `json:"habits_total"`
	HabitsLeft  []string `json:"habits_left"`
	LowCount    int      `json:"low_count"`
	LowNames    []string `json:"low_names"`
	// The next few deadlines only; a widget has three lines, not a page.
	Upcoming []widgetEntry `json:"upcoming"`
	Running  []widgetClock `json:"running"`
	// Server time, so the widget can say how stale it is.
	At time.Time `json:"at"`
}

const widgetUpcoming = 3

// widgetAllowed accepts either a live session token — the phone signed in
// through the app — or the MCP token. Both compared without leaking timing:
// this endpoint is reachable by anyone.
func (s *Server) widgetAllowed(ctx context.Context, token string) bool {
	if token == "" {
		return false
	}
	if s.cfg.MCPToken != "" &&
		subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.MCPToken)) == 1 {
		return true
	}
	userID, err := parseToken(s.cfg.SessionKey, token, time.Now())
	if err != nil {
		return false
	}
	_, err = s.store.UserByID(ctx, userID)
	return err == nil
}

func (s *Server) handleWidget(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !s.widgetAllowed(ctx, bearer(r)) {
		fail(w, http.StatusUnauthorized, "token salah")
		return
	}

	o, err := s.store.Overview(ctx)
	if err != nil {
		s.oops(w, err)
		return
	}
	running, err := s.store.RunningEntries(ctx)
	if err != nil {
		s.oops(w, err)
		return
	}

	now := time.Now()
	out := widgetSummary{
		HabitsDone:  o.Done,
		HabitsTotal: o.Total,
		HabitsLeft:  o.Left,
		LowCount:    len(o.LowSupplies),
		LowNames:    []string{},
		Upcoming:    []widgetEntry{},
		Running:     []widgetClock{},
		At:          now,
	}
	for _, item := range o.LowSupplies {
		out.LowNames = append(out.LowNames, item.Name)
	}
	for _, e := range o.Upcoming {
		if len(out.Upcoming) >= widgetUpcoming {
			break
		}
		out.Upcoming = append(out.Upcoming, widgetEntry{
			Label: e.Label,
			Kind:  e.Kind,
			Date:  e.Date.Format("2006-01-02"),
			Days:  daysUntil(now, e.Date),
			URL:   e.URL,
		})
	}
	for _, c := range running {
		out.Running = append(out.Running, widgetClock{
			Project:   c.Project,
			Part:      c.Part,
			StartedAt: c.StartedAt,
			Seconds:   c.Seconds,
		})
	}
	writeJSON(w, http.StatusOK, out)
}
