package api

import (
	"net/http"
	"strconv"
)

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := trim(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	hits, err := s.store.Search(r.Context(), query, limit)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"query": query, "hits": hits})
}
