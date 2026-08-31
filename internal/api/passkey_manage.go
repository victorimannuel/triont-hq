package api

import (
	"net/http"
	"strings"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// Listing, renaming and removing registered devices. Removal is how two-step
// protection gets switched off, so it asks for a fresh check first — see
// passkey_stepup.go.

func (s *Server) handleListPasskeys(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	keys, err := s.store.Passkeys(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"passkeys": keys})
}

type passkeyName struct {
	Name string `json:"name"`
}

func (s *Server) handleRenamePasskey(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in passkeyName
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		fail(w, http.StatusBadRequest, "namanya nggak boleh kosong")
		return
	}

	saved, err := s.store.RenamePasskey(r.Context(), user.ID, id, in.Name)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeletePasskey(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	// Removing devices is how two-step protection gets switched off, so it
	// asks for the same fresh proof that handing out an enrolment link does.
	if !s.freshlyVerified(r, user) {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error": "verifikasi dulu di perangkat ini",
			"step":  "passkey",
		})
		return
	}

	if err := s.store.DeletePasskey(r.Context(), user.ID, id); err != nil {
		s.oops(w, err)
		return
	}
	// One verification, one removal.
	s.clearFresh(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
