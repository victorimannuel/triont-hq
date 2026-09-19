package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) readCalendarEvent(r *http.Request) (store.CalendarEventInput, string) {
	var in store.CalendarEventInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Title = trim(in.Title)
	if in.Title == "" {
		return in, "judul acaranya wajib diisi"
	}
	in.OnDate = trim(in.OnDate)
	if in.OnDate == "" {
		return in, "tanggalnya wajib diisi"
	}
	in.Notes = trim(in.Notes)
	return in, ""
}

func (s *Server) handleGetCalendarEvent(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	event, err := s.store.CalendarEventByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, event)
}

func (s *Server) handleCreateCalendarEvent(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readCalendarEvent(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	event, err := s.store.CreateCalendarEvent(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, event)
}

func (s *Server) handleUpdateCalendarEvent(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readCalendarEvent(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	event, err := s.store.UpdateCalendarEvent(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, event)
}

func (s *Server) handleDeleteCalendarEvent(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteCalendarEvent(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
