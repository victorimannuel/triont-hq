package api

import (
	"net/http"
	"strconv"
	"time"
)

func (s *Server) handleJournal(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	entries, err := s.store.Journal(r.Context(), days)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"journal": entries})
}

// The date is the caller's own, the way a habit tick is: a line written at
// half past midnight belongs to the day the person thinks it is.
func journalDay(r *http.Request) (time.Time, bool) {
	day, err := time.Parse("2006-01-02", trim(r.PathValue("on")))
	if err != nil {
		return time.Time{}, false
	}
	if day.After(time.Now().AddDate(0, 0, 1)) {
		return time.Time{}, false
	}
	return day, true
}

func (s *Server) handleJournalDay(w http.ResponseWriter, r *http.Request) {
	day, ok := journalDay(r)
	if !ok {
		fail(w, http.StatusBadRequest, "tanggal harus format YYYY-MM-DD")
		return
	}
	entry, err := s.store.JournalDayOn(r.Context(), day)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) handleSetJournalLine(w http.ResponseWriter, r *http.Request) {
	day, ok := journalDay(r)
	if !ok {
		fail(w, http.StatusBadRequest, "tanggal harus format YYYY-MM-DD")
		return
	}

	var in struct {
		Line string `json:"line"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	// One line, not an essay. Long enough for a real sentence and short
	// enough that the page never turns into a text editor.
	if len(in.Line) > 500 {
		fail(w, http.StatusBadRequest, "kepanjangan, ini buat satu baris")
		return
	}

	entry, err := s.store.SetJournalLine(r.Context(), day, in.Line, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}
