package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListCredentials(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	var projectID *int64
	if slug := q.Get("project"); slug != "" {
		project, err := s.store.ProjectBySlug(r.Context(), slug)
		if err != nil {
			s.oops(w, err)
			return
		}
		projectID = &project.ID
	}

	credentials, err := s.store.ListCredentials(r.Context(), projectID, q.Get("kind"))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"credentials": credentials})
}

func (s *Server) readCredential(r *http.Request) (store.CredentialInput, string) {
	var in store.CredentialInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Label = trim(in.Label)
	if in.Label == "" {
		return in, "label wajib diisi"
	}
	in.Kind = valid(credentialKinds, in.Kind, "other")
	in.Username = trim(in.Username)
	in.Host = trim(in.Host)
	in.URL = trim(in.URL)
	return in, ""
}

func (s *Server) handleCreateCredential(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readCredential(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	cipher := ""
	if in.Secret != "" {
		var err error
		if cipher, err = s.box.Encrypt(in.Secret); err != nil {
			s.oops(w, err)
			return
		}
	}

	credential, err := s.store.CreateCredential(r.Context(), in, cipher, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, credential)
}

func (s *Server) handleUpdateCredential(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readCredential(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	// An empty secret field means "leave what is already stored alone".
	var cipher *string
	if in.Secret != "" {
		sealed, err := s.box.Encrypt(in.Secret)
		if err != nil {
			s.oops(w, err)
			return
		}
		cipher = &sealed
	}

	credential, err := s.store.UpdateCredential(r.Context(), id, in, cipher, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, credential)
}

func (s *Server) handleDeleteCredential(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteCredential(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReveal is the only path that returns a decrypted secret, and it is a
// POST so the value never lands in a URL, a log line, or a browser history.
func (s *Server) handleReveal(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	cipher, err := s.store.CipherByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	plain, err := s.box.Decrypt(cipher)
	if err != nil {
		s.log.Error("decrypt failed", "credential_id", id, "err", err)
		fail(w, http.StatusInternalServerError, "secret nggak bisa dibuka — kunci enkripsinya cocok?")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]string{"secret": plain})
}
