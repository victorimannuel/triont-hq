package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListDocuments(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	documents, err := s.store.ListDocuments(r.Context(), store.DocumentFilter{
		Kind:   q.Get("kind"),
		Holder: q.Get("holder"),
		Query:  q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	holders, err := s.store.DocumentHolders(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": documents, "holders": holders})
}

func (s *Server) handleGetDocument(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	document, err := s.store.DocumentByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, document)
}

func (s *Server) readDocument(r *http.Request) (store.DocumentInput, string) {
	var in store.DocumentInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama dokumen wajib diisi"
	}
	in.Kind = valid(documentKinds, in.Kind, "other")
	in.Holder = trim(in.Holder)
	in.Issuer = trim(in.Issuer)
	in.Location = trim(in.Location)

	for label, value := range map[string]*string{
		"terbit":       &in.IssuedOn,
		"masa berlaku": &in.ExpiresOn,
	} {
		*value = trim(*value)
		if *value == "" {
			continue
		}
		if _, err := time.Parse("2006-01-02", *value); err != nil {
			return in, "tanggal " + label + " harus format YYYY-MM-DD"
		}
	}
	return in, ""
}

func (s *Server) handleCreateDocument(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readDocument(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	cipher := ""
	if in.Number != "" {
		var err error
		if cipher, err = s.box.Encrypt(in.Number); err != nil {
			s.oops(w, err)
			return
		}
	}

	document, err := s.store.CreateDocument(r.Context(), in, cipher, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, document)
}

func (s *Server) handleUpdateDocument(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readDocument(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}

	// An empty number field means "leave what is stored alone".
	var cipher *string
	if in.Number != "" {
		sealed, err := s.box.Encrypt(in.Number)
		if err != nil {
			s.oops(w, err)
			return
		}
		cipher = &sealed
	}

	document, err := s.store.UpdateDocument(r.Context(), id, in, cipher, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, document)
}

func (s *Server) handleDeleteDocument(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteDocument(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleRevealDocument is the only path that returns a document number in the
// clear, and it is a POST so the value never lands in a URL or a log line.
func (s *Server) handleRevealDocument(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	cipher, err := s.store.DocumentCipher(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	plain, err := s.box.Decrypt(cipher)
	if err != nil {
		s.log.Error("decrypt failed", "document_id", id, "err", err)
		fail(w, http.StatusInternalServerError, "nomornya nggak bisa dibuka")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]string{"number": plain})
}
