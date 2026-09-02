package api

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// The ingest endpoint is the one door into HQ that a session cookie does not
// open, because the thing knocking is a cron job on a server rather than a
// person in a browser. It carries a token instead, and it can only write
// monitoring rows — nothing else in the app is reachable through it.

const monitorStatuses = "ok, warn, down"

type reportRequest struct {
	Source string `json:"source"`
	// How long this monitor may stay quiet before HQ treats the silence
	// itself as a problem. Its own cron schedule is what knows this.
	SilentAfterMinutes int                 `json:"silent_after_minutes"`
	Checks             []store.CheckReport `json:"checks"`
}

func (s *Server) handleReport(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MonitorToken == "" {
		fail(w, http.StatusNotFound, "ingest monitor nggak aktif")
		return
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	// Constant time: this is a bearer token on an endpoint anyone can reach.
	if subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.MonitorToken)) != 1 {
		fail(w, http.StatusUnauthorized, "token salah")
		return
	}

	var in reportRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "laporan nggak kebaca")
		return
	}
	in.Source = trim(in.Source)
	if in.Source == "" {
		fail(w, http.StatusBadRequest, "source wajib diisi")
		return
	}
	if in.SilentAfterMinutes <= 0 {
		in.SilentAfterMinutes = 60
	}

	for i, c := range in.Checks {
		in.Checks[i].Key = trim(c.Key)
		in.Checks[i].Name = trim(c.Name)
		if in.Checks[i].Key == "" {
			fail(w, http.StatusBadRequest, "tiap check butuh key")
			return
		}
		if in.Checks[i].Name == "" {
			in.Checks[i].Name = in.Checks[i].Key
		}
		switch c.Status {
		case "ok", "warn", "down":
		default:
			fail(w, http.StatusBadRequest, "status harus salah satu dari: "+monitorStatuses)
			return
		}
	}

	changed, err := s.store.Report(r.Context(), in.Source, in.SilentAfterMinutes, in.Checks)
	if err != nil {
		s.oops(w, err)
		return
	}

	// A change is the only thing worth waking someone for. Steady-state
	// reports every ten minutes must stay silent.
	go s.announce(changed)

	writeJSON(w, http.StatusOK, map[string]any{
		"accepted": len(in.Checks),
		"changed":  len(changed),
	})
}

// announce pushes when something breaks or comes back. It runs detached from
// the request so a slow push service cannot hold up a cron job.
func (s *Server) announce(changed []store.Check) {
	broke := []store.Check{}
	fixed := []store.Check{}
	for _, c := range changed {
		if c.Status == "ok" {
			fixed = append(fixed, c)
		} else {
			broke = append(broke, c)
		}
	}
	if len(broke) == 0 && len(fixed) == 0 {
		return
	}

	ctx, cancel := detached()
	defer cancel()

	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil || len(subs) == 0 {
		return
	}

	url := "/monitor"
	if len(broke) == 1 && len(fixed) == 0 && broke[0].URL != "" {
		url = broke[0].URL
	}

	s.pushEach(ctx, subs, func(lang string) payload {
		title, body := "", ""
		switch {
		case len(broke) == 1 && len(fixed) == 0:
			title = broke[0].Name
			body = broke[0].Detail
		case len(broke) > 0:
			title = textTroubleTitle(lang, len(broke))
			body = names(lang, broke)
		case len(fixed) == 1:
			title = textFixedOneTitle(lang, fixed[0].Name)
		default:
			title = textFixedTitle(lang, len(fixed))
			body = names(lang, fixed)
		}
		return payload{
			Title: title,
			Body:  body,
			URL:   url,
			// No shared tag: an outage should not quietly replace the last one.
			Tag: "hq-monitor-" + changed[0].Key,
		}
	})
}

func names(lang string, checks []store.Check) string {
	out := make([]string, 0, len(checks))
	for _, c := range checks {
		out = append(out, c.Name)
	}
	return listSome(lang, out, 3)
}

func (s *Server) handleMonitor(w http.ResponseWriter, r *http.Request) {
	checks, err := s.store.Checks(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	monitors, err := s.store.Monitors(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"checks":   checks,
		"monitors": monitors,
	})
}
