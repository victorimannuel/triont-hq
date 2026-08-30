package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListClients(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	clients, err := s.store.ListClients(r.Context(), store.ClientFilter{
		Status: q.Get("status"),
		Query:  q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"clients": clients})
}

func (s *Server) handleGetClient(w http.ResponseWriter, r *http.Request) {
	client, err := s.store.ClientBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, client)
}

func (s *Server) readClient(r *http.Request) (store.ClientInput, string) {
	var in store.ClientInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama klien wajib diisi"
	}
	in.Company = trim(in.Company)
	in.Kind = valid(clientKinds, in.Kind, "company")
	in.Status = valid(clientStatuses, in.Status, "active")
	return in, ""
}

func (s *Server) handleCreateClient(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readClient(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	client, err := s.store.CreateClient(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, client)
}

func (s *Server) handleUpdateClient(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readClient(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	client, err := s.store.UpdateClient(r.Context(), r.PathValue("slug"), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, client)
}

func (s *Server) handleDeleteClient(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteClient(r.Context(), r.PathValue("slug"), actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) readContact(r *http.Request) (store.ContactInput, string) {
	var in store.ContactInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama kontak wajib diisi"
	}
	in.Role = trim(in.Role)
	in.Email = trim(in.Email)
	in.Phone = trim(in.Phone)
	return in, ""
}

func (s *Server) handleCreateContact(w http.ResponseWriter, r *http.Request) {
	client, err := s.store.ClientBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	in, msg := s.readContact(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	contact, err := s.store.CreateContact(r.Context(), client.ID, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, contact)
}

func (s *Server) handleUpdateContact(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readContact(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	contact, err := s.store.UpdateContact(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, contact)
}

func (s *Server) handleDeleteContact(w http.ResponseWriter, r *http.Request) {
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
