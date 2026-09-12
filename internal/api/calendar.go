package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// handleCalendar defaults to a window that starts a month back — a deadline
// you already missed is exactly the one you need to see.
func (s *Server) handleCalendar(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	from := now.AddDate(0, -1, 0)
	to := now.AddDate(1, 0, 0)

	if v := r.URL.Query().Get("from"); v != "" {
		parsed, err := time.Parse("2006-01-02", v)
		if err != nil {
			fail(w, http.StatusBadRequest, "from harus format YYYY-MM-DD")
			return
		}
		from = parsed
	}
	if v := r.URL.Query().Get("to"); v != "" {
		parsed, err := time.Parse("2006-01-02", v)
		if err != nil {
			fail(w, http.StatusBadRequest, "to harus format YYYY-MM-DD")
			return
		}
		to = parsed
	}
	if to.Before(from) {
		fail(w, http.StatusBadRequest, "rentang tanggalnya kebalik")
		return
	}

	entries, err := s.store.Calendar(r.Context(), from, to)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from":    from.Format("2006-01-02"),
		"to":      to.Format("2006-01-02"),
		"entries": entries,
	})
}

// handleCalendarMarks reads back what was done about one thing's dates. The
// ref is the entry's own URL, the same string the mark was filed under.
func (s *Server) handleCalendarMarks(w http.ResponseWriter, r *http.Request) {
	ref := trim(r.URL.Query().Get("ref"))
	if ref == "" {
		fail(w, http.StatusBadRequest, "ref wajib diisi")
		return
	}
	marks, err := s.store.CalendarMarksFor(r.Context(), ref)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"marks": marks})
}

/*
A birthday is ticked rather than fixed, so the tick needs somewhere to go.

The body names the occurrence the way the entry already names itself: its kind,
its URL and its date. There is no id to use — the entry is derived from a
contact's birthday every time it is read, and it exists only for as long as the
window it was read in.
*/
func (s *Server) handleMarkCalendarEntry(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind string `json:"kind"`
		Ref  string `json:"ref"`
		Date string `json:"date"`
		// What was done about it, in his own words. Optional: a date dealt
		// with and not written up is still a date dealt with.
		Note string `json:"note"`
		Done bool   `json:"done"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	in.Kind = trim(in.Kind)
	in.Ref = trim(in.Ref)
	in.Date = trim(in.Date)
	in.Note = trim(in.Note)
	if !store.Markable(in.Kind) {
		fail(w, http.StatusBadRequest, "jenis ini nggak bisa dicentang")
		return
	}
	if in.Ref == "" {
		fail(w, http.StatusBadRequest, "ref wajib diisi")
		return
	}
	// The entry carries its date as a timestamp, because that is what a
	// time.Time serialises to, so the day has to be taken off the front of it.
	// A plain day is accepted too — it is the same date either way.
	day, err := time.Parse(time.RFC3339, in.Date)
	if err != nil {
		day, err = time.Parse("2006-01-02", in.Date)
	}
	if err != nil {
		fail(w, http.StatusBadRequest, "tanggal harus format YYYY-MM-DD")
		return
	}
	in.Date = day.Format("2006-01-02")

	if in.Done {
		err = s.store.MarkCalendarEntry(r.Context(), in.Kind, in.Ref, in.Date, in.Note, actor(r))
	} else {
		err = s.store.UnmarkCalendarEntry(r.Context(), in.Kind, in.Ref, in.Date)
	}
	if err != nil {
		s.oops(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
