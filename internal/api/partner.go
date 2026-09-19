package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListPartner(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.PartnerItems(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) readPartner(r *http.Request) (store.PartnerInput, string) {
	var in store.PartnerInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Item = trim(in.Item)
	if in.Item == "" {
		return in, "barangnya wajib diisi"
	}
	// bought_on is free to be blank: an item not bought yet has no date. The
	// store's parseDate turns "" into a null and rejects anything unparseable.
	in.BoughtOn = trim(in.BoughtOn)
	return in, ""
}

func (s *Server) handleCreatePartner(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readPartner(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	item, err := s.store.CreatePartnerItem(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleUpdatePartner(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readPartner(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	item, err := s.store.UpdatePartnerItem(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleDeletePartner(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeletePartnerItem(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
