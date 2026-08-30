package api

import (
	"net/http"
	"time"
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
