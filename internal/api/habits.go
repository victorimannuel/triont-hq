package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListHabits(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	habits, err := s.store.Habits(r.Context(), days)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"habits": habits})
}

func (s *Server) readHabit(r *http.Request) (store.HabitInput, string) {
	var in store.HabitInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama kebiasaannya wajib diisi"
	}
	in.Notes = trim(in.Notes)
	in.Unit = trim(in.Unit)
	return in, ""
}

func (s *Server) handleCreateHabit(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readHabit(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	// A new one is meant to be done, which is the only reason to add it.
	in.Active = true
	habit, err := s.store.CreateHabit(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, habit)
}

func (s *Server) handleUpdateHabit(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readHabit(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	habit, err := s.store.UpdateHabit(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, habit)
}

func (s *Server) handleDeleteHabit(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteHabit(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

/*
handleSetHabitDay is the tap on a cell.

The day comes from the client rather than the server clock: the phone knows
what "today" means where it is standing, and a tick at half past midnight
belongs to the day the person thinks it is. A date in the future is refused,
though — that is a bug in the caller, not a plan.
*/
func (s *Server) handleSetHabitDay(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	var in struct {
		On   string `json:"on"`
		Done bool   `json:"done"`
		// What today was worth, for a habit that counts something. Absent or
		// zero means one, which is what a plain tick has always meant.
		Amount float64 `json:"amount"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	day, err := time.Parse("2006-01-02", trim(in.On))
	if err != nil {
		fail(w, http.StatusBadRequest, "tanggal harus format YYYY-MM-DD")
		return
	}
	// A day either side of the server's own date, so a phone in another
	// timezone is fine and a typo three weeks out is not.
	if day.After(time.Now().AddDate(0, 0, 1)) {
		fail(w, http.StatusBadRequest, "belum kejadian")
		return
	}

	if err := s.store.SetHabitDay(r.Context(), id, day, in.Done, in.Amount); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
