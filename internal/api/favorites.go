package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// The starred nav destinations, per account, so the same favourites show up on
// every device rather than living in one browser's storage.

func (s *Server) handleGetFavorites(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	keys, err := s.store.NavFavorites(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys})
}

func (s *Server) handleSetFavorites(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	var in struct {
		Keys []string `json:"keys"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}

	// A handful of short keys is all this ever is. Blanks and anything absurd are
	// dropped rather than stored, so a bad caller cannot bloat the row.
	keys := make([]string, 0, len(in.Keys))
	for _, k := range in.Keys {
		k = trim(k)
		if k == "" || len(k) > 64 {
			continue
		}
		keys = append(keys, k)
		if len(keys) >= 50 {
			break
		}
	}

	if err := s.store.SetNavFavorites(r.Context(), user.ID, keys); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys})
}
