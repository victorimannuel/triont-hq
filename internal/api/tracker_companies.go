package api

import "net/http"

func (s *Server) handleListTrackerCompanies(w http.ResponseWriter, r *http.Request) {
	companies, err := s.store.ListTrackerCompanies(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"companies": companies})
}

// readCompanyName pulls the one field these handlers take, trimmed and required.
func (s *Server) readCompanyName(r *http.Request) (string, string) {
	var in struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		return "", "isian nggak kebaca"
	}
	name := trim(in.Name)
	if name == "" {
		return "", "nama company wajib diisi"
	}
	return name, ""
}

func (s *Server) handleCreateTrackerCompany(w http.ResponseWriter, r *http.Request) {
	name, msg := s.readCompanyName(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	c, err := s.store.CreateTrackerCompany(r.Context(), name, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) handleUpdateTrackerCompany(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	name, msg := s.readCompanyName(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	c, err := s.store.UpdateTrackerCompany(r.Context(), id, name, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleDeleteTrackerCompany(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteTrackerCompany(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
