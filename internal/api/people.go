package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListPeople(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	people, err := s.store.ListPeople(r.Context(), store.PersonFilter{
		Query: q.Get("q"),
		Scope: q.Get("scope"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"people": people})
}

func (s *Server) handleGetPerson(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	person, err := s.store.PersonByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, person)
}

func (s *Server) readPerson(r *http.Request) (store.PersonInput, string) {
	var in store.PersonInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama wajib diisi"
	}
	in.Nickname = trim(in.Nickname)
	in.Role = trim(in.Role)
	in.Email = trim(in.Email)
	in.Phone = trim(in.Phone)
	in.Birthday = trim(in.Birthday)
	in.LastContactedOn = trim(in.LastContactedOn)
	if !dateOK(in.Birthday) || !dateOK(in.LastContactedOn) {
		return in, "tanggal harus format YYYY-MM-DD"
	}
	if in.ReachEveryDays < 0 {
		return in, "jeda menyapa nggak boleh minus"
	}
	return in, ""
}

func (s *Server) handleCreatePerson(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readPerson(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	person, err := s.store.CreatePerson(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, person)
}

func (s *Server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readPerson(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	person, err := s.store.UpdatePerson(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, person)
}

func (s *Server) handleDeletePerson(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteContact(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleTouchPerson is the one-tap "sudah ngobrol hari ini".
func (s *Server) handleTouchPerson(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.TouchPerson(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
