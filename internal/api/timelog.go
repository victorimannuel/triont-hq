package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// The work log. One clock, a day at a time, and two summaries over the window
// behind it: where the hours went by day, and where they went by project.

func (s *Server) handleListTime(w http.ResponseWriter, r *http.Request) {
	day, err := dayFrom(r.URL.Query().Get("on"))
	if err != nil {
		fail(w, http.StatusBadRequest, "tanggalnya harus format YYYY-MM-DD")
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days <= 0 || days > 90 {
		days = 7
	}
	// The window ends on the day being looked at and runs backwards, so the
	// strip always has today on its right-hand end.
	from := day.AddDate(0, 0, -(days - 1))

	entries, err := s.store.EntriesOn(r.Context(), day)
	if err != nil {
		s.oops(w, err)
		return
	}
	week, err := s.store.DayWork(r.Context(), from, day)
	if err != nil {
		s.oops(w, err)
		return
	}
	projects, err := s.store.ProjectTotals(r.Context(), from, day)
	if err != nil {
		s.oops(w, err)
		return
	}

	// The clocks that are going come back whatever day is being looked at,
	// because the buttons that stop them are on every one of them.
	running, err := s.store.RunningEntries(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	parts, err := s.store.KnownParts(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}

	var seconds int64
	for _, entry := range entries {
		seconds += entry.Seconds
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"on":       day.Format("2006-01-02"),
		"entries":  entries,
		"running":  running,
		"seconds":  seconds,
		"days":     week,
		"projects": projects,
		"parts":    parts,
	})
}

// handleRunningTime is what the pill in the shell asks for on every page
// change. Its own endpoint because it is the cheapest question the log can be
// asked, and the page's full answer — a day, a week, a month of sums — is a
// lot to fetch to find out whether anything is ticking.
func (s *Server) handleRunningTime(w http.ResponseWriter, r *http.Request) {
	running, err := s.store.RunningEntries(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"running": running})
}

/*
handleTimeSummary is the month, which is the unit a month gets looked at in.

A trailing thirty days would be the easier thing to build and the wrong thing
to read: what gets reported, invoiced or argued about is September, not the
last thirty days, and the two disagree by however many days into October it
happens to be.
*/
func (s *Server) handleTimeSummary(w http.ResponseWriter, r *http.Request) {
	first, err := monthFrom(r.URL.Query().Get("month"))
	if err != nil {
		fail(w, http.StatusBadRequest, "bulannya harus format YYYY-MM")
		return
	}
	last := first.AddDate(0, 1, -1)

	days, err := s.store.DayWork(r.Context(), first, last)
	if err != nil {
		s.oops(w, err)
		return
	}
	projects, err := s.store.ProjectTotals(r.Context(), first, last)
	if err != nil {
		s.oops(w, err)
		return
	}

	var seconds int64
	worked := 0
	for _, day := range days {
		seconds += day.Seconds
		if day.Seconds > 0 {
			worked++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"month":    first.Format("2006-01"),
		"seconds":  seconds,
		"worked":   worked,
		"days":     days,
		"projects": projects,
	})
}

// monthFrom reads the month off the query string, defaulting to the one the
// server is in. The client sends its own, for the same reason it sends its own
// day: on the first of the month the two can disagree.
func monthFrom(value string) (time.Time, error) {
	if value == "" {
		now := time.Now()
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()), nil
	}
	return time.ParseInLocation("2006-01", value, time.Local)
}

func (s *Server) handleStartTime(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readTimeEntry(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	// Starting is always now, whatever a stray end was sent along with it.
	in.EndedAt = ""

	entry, err := s.store.StartEntry(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

// handleStopTime puts one clock down. Which one has to be said, because there
// can be several.
func (s *Server) handleStopTime(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	entry, err := s.store.StopEntry(r.Context(), id, time.Now(), actor(r))
	if errors.Is(err, store.ErrNotFound) {
		fail(w, http.StatusConflict, "yang ini udah berhenti")
		return
	}
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) handleCreateTime(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readTimeEntry(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	// Written down after the fact, so both ends are required: an entry with
	// no end is a running clock, and that is what the start button is for.
	if strings.TrimSpace(in.EndedAt) == "" {
		fail(w, http.StatusBadRequest, "jam selesainya wajib diisi")
		return
	}

	entry, err := s.store.CreateEntry(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

func (s *Server) handleUpdateTime(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readTimeEntry(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	entry, err := s.store.UpdateEntry(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) handleDeleteTime(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteTimeEntry(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readTimeEntry reads the body and says what is wrong with it, empty when
// nothing is.
func (s *Server) readTimeEntry(r *http.Request) (store.TimeEntryInput, string) {
	var in store.TimeEntryInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Note = trim(in.Note)
	in.Part = trim(in.Part)
	if in.ProjectID != nil && *in.ProjectID <= 0 {
		in.ProjectID = nil
	}
	// A part belongs to a project. Keeping one without the other would put a
	// bare "NPD" in the summary with nothing above it to say whose it is.
	if in.ProjectID == nil {
		in.Part = ""
	}
	if msg := badMoment(in.StartedAt); msg != "" {
		return in, msg
	}
	if msg := badMoment(in.EndedAt); msg != "" {
		return in, msg
	}
	if !endsAfterStart(in) {
		return in, "jam selesai harus setelah jam mulai"
	}
	return in, ""
}

// badMoment rejects a timestamp the store would only reject later with a
// message about layouts. Empty is allowed: it means now, or still running.
func badMoment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if _, err := time.Parse(time.RFC3339, value); err != nil {
		return "waktunya nggak kebaca"
	}
	return ""
}

// endsAfterStart catches the swap that would otherwise store a negative
// stretch and quietly count as zero.
func endsAfterStart(in store.TimeEntryInput) bool {
	started, err := time.Parse(time.RFC3339, strings.TrimSpace(in.StartedAt))
	if err != nil {
		return true
	}
	ended, err := time.Parse(time.RFC3339, strings.TrimSpace(in.EndedAt))
	if err != nil {
		return true
	}
	return ended.After(started)
}
