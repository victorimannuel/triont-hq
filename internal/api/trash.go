package api

import (
	"net/http"
	"strings"
)

func (s *Server) handleTrash(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListTrash(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleRestore(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	who := actor(r)
	switch r.PathValue("entity") {
	case "project":
		err = s.store.RestoreProject(r.Context(), id, who)
	case "client":
		err = s.store.RestoreClient(r.Context(), id, who)
	case "asset":
		err = s.store.RestoreAsset(r.Context(), id, who)
	case "credential":
		err = s.store.RestoreCredential(r.Context(), id, who)
	case "document":
		err = s.store.RestoreDocument(r.Context(), id, who)
	case "belonging":
		err = s.store.RestoreBelonging(r.Context(), id, who)
	case "person":
		err = s.store.RestoreContact(r.Context(), id, who)
	case "income":
		err = s.store.RestoreIncome(r.Context(), id, who)
	case "expense":
		err = s.store.RestoreExpense(r.Context(), id, who)
	default:
		fail(w, http.StatusBadRequest, "jenis nggak dikenal")
		return
	}

	if err != nil {
		// A slug taken by something created after the delete is the one failure
		// worth explaining rather than logging as a server fault.
		if strings.Contains(err.Error(), "duplicate key") {
			fail(w, http.StatusConflict, "namanya sudah dipakai yang lain — ganti dulu yang baru")
			return
		}
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handlePurge(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.PurgeTrash(r.Context(), r.PathValue("entity"), id); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
