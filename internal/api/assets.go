package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListAssets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	assets, err := s.store.ListAssets(r.Context(), store.AssetFilter{
		Kind:    q.Get("kind"),
		Status:  q.Get("status"),
		Query:   q.Get("q"),
		Project: q.Get("project"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"assets": assets})
}

func (s *Server) handleGetAsset(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	asset, err := s.store.AssetByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, asset)
}

func (s *Server) readAsset(r *http.Request) (store.AssetInput, string) {
	var in store.AssetInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama aset wajib diisi"
	}
	in.Provider = trim(in.Provider)
	in.Identifier = trim(in.Identifier)
	in.Kind = valid(assetKinds, in.Kind, "other")
	in.Status = valid(assetStatuses, in.Status, "active")
	in.BillingCycle = valid(billingCycles, in.BillingCycle, "yearly")
	in.CostCurrency = valid(currencies, in.CostCurrency, "IDR")
	if in.CostAmount < 0 {
		return in, "biaya nggak boleh minus"
	}
	// Checked here so a typo comes back as a 400 the form can show, not a 500.
	in.RenewsOn = trim(in.RenewsOn)
	if in.RenewsOn != "" {
		if _, err := time.Parse("2006-01-02", in.RenewsOn); err != nil {
			return in, "tanggal perpanjangan harus format YYYY-MM-DD"
		}
	}
	return in, ""
}

func (s *Server) handleCreateAsset(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readAsset(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	asset, err := s.store.CreateAsset(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, asset)
}

func (s *Server) handleUpdateAsset(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readAsset(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	asset, err := s.store.UpdateAsset(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, asset)
}

func (s *Server) handleDeleteAsset(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteAsset(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type attachRequest struct {
	AssetID int64  `json:"asset_id"`
	Role    string `json:"role"`
}

func (s *Server) handleAttachAsset(w http.ResponseWriter, r *http.Request) {
	project, err := s.store.ProjectBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	var in attachRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	if in.AssetID == 0 {
		fail(w, http.StatusBadRequest, "pilih asetnya dulu")
		return
	}
	if err := s.store.AttachAsset(r.Context(), project.ID, in.AssetID, trim(in.Role)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDetachAsset(w http.ResponseWriter, r *http.Request) {
	project, err := s.store.ProjectBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.oops(w, err)
		return
	}
	assetID, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DetachAsset(r.Context(), project.ID, assetID); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
