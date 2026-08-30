package api

import "net/http"

func (s *Server) handleListTags(w http.ResponseWriter, r *http.Request) {
	tags, err := s.store.ListTags(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tags": tags})
}

func (s *Server) handleDeleteTag(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteTag(r.Context(), id); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type tagRequest struct {
	Name string `json:"name"`
}

// handleTagProject takes a name rather than an id: the front-end is a plain
// text box, and an unseen name simply becomes a new tag.
func (s *Server) handleTagProject(w http.ResponseWriter, r *http.Request) {
	project, err := s.store.ProjectBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}

	var in tagRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	if trim(in.Name) == "" {
		fail(w, http.StatusBadRequest, "tag-nya kosong")
		return
	}

	tag, err := s.store.EnsureTag(r.Context(), in.Name, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	if err := s.store.AttachTag(r.Context(), "project", project.ID, tag.ID); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tag)
}

func (s *Server) handleUntagProject(w http.ResponseWriter, r *http.Request) {
	project, err := s.store.ProjectBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	tagID, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DetachTag(r.Context(), "project", project.ID, tagID); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
