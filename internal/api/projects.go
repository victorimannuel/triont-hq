package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	projects, err := s.store.ListProjects(r.Context(), store.ProjectFilter{
		Status: q.Get("status"),
		Kind:   q.Get("kind"),
		Client: q.Get("client"),
		Tag:    q.Get("tag"),
		Query:  q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	clients, err := s.store.ListClients(r.Context(), store.ClientFilter{})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects, "clients": clients})
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	project, err := s.store.ProjectBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (s *Server) readProject(r *http.Request) (store.ProjectInput, string) {
	var in store.ProjectInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama project wajib diisi"
	}
	in.Status = valid(statuses, in.Status, "active")
	in.Kind = valid(kinds, in.Kind, "other")
	return in, ""
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readProject(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	project, err := s.store.CreateProject(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readProject(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	project, err := s.store.UpdateProject(r.Context(), r.PathValue("slug"), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteProject(r.Context(), r.PathValue("slug"), actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) readLink(r *http.Request) (store.LinkInput, string) {
	var in store.LinkInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.URL = trim(in.URL)
	if in.URL == "" {
		return in, "URL wajib diisi"
	}
	in.Label = trim(in.Label)
	in.Category = valid(linkCategories, in.Category, "other")
	return in, ""
}

func (s *Server) handleCreateLink(w http.ResponseWriter, r *http.Request) {
	project, err := s.store.ProjectBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	in, msg := s.readLink(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	link, err := s.store.CreateLink(r.Context(), project.ID, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, link)
}

func (s *Server) handleUpdateLink(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readLink(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	link, err := s.store.UpdateLink(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, link)
}

func (s *Server) handleDeleteLink(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteLink(r.Context(), id); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
