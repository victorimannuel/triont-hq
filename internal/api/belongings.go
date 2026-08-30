package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListBelongings(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := s.store.ListBelongings(r.Context(), store.BelongingFilter{
		Kind:   q.Get("kind"),
		Status: q.Get("status"),
		Query:  q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"belongings": items})
}

func (s *Server) handleGetBelonging(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	item, err := s.store.BelongingByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func dateOK(value string) bool {
	if value == "" {
		return true
	}
	_, err := time.Parse("2006-01-02", value)
	return err == nil
}

func (s *Server) readBelonging(r *http.Request) (store.BelongingInput, string) {
	var in store.BelongingInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama wajib diisi"
	}
	in.Kind = valid(belongingKinds, in.Kind, "other")
	in.Status = valid(belongingStatuses, in.Status, "active")
	in.Ownership = valid(ownerships, in.Ownership, "owned")
	in.Condition = valid(conditions, in.Condition, "new")
	in.RentCycle = valid(billingCycles, in.RentCycle, "monthly")
	in.RentDueOn = trim(in.RentDueOn)
	if !dateOK(in.RentDueOn) {
		return in, "tanggal harus format YYYY-MM-DD"
	}
	in.Currency = valid(currencies, in.Currency, "IDR")
	in.Brand = trim(in.Brand)
	in.Model = trim(in.Model)
	in.Identifier = trim(in.Identifier)
	in.Location = trim(in.Location)
	in.AcquiredOn = trim(in.AcquiredOn)
	in.WarrantyUntil = trim(in.WarrantyUntil)
	if !dateOK(in.AcquiredOn) || !dateOK(in.WarrantyUntil) {
		return in, "tanggal harus format YYYY-MM-DD"
	}
	if in.Price < 0 {
		return in, "harga nggak boleh minus"
	}
	return in, ""
}

func (s *Server) handleCreateBelonging(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readBelonging(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	item, err := s.store.CreateBelonging(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleUpdateBelonging(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readBelonging(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	item, err := s.store.UpdateBelonging(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleDeleteBelonging(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteBelonging(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleCreateMaintenance(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if _, err := s.store.BelongingByID(r.Context(), id); err != nil {
		s.oops(w, err)
		return
	}

	var in store.MaintenanceInput
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	in.Kind = valid(maintenanceKinds, in.Kind, "service")
	in.Description = trim(in.Description)
	in.Vendor = trim(in.Vendor)
	in.DoneOn = trim(in.DoneOn)
	in.NextDue = trim(in.NextDue)
	if !dateOK(in.DoneOn) || !dateOK(in.NextDue) {
		fail(w, http.StatusBadRequest, "tanggal harus format YYYY-MM-DD")
		return
	}

	log, err := s.store.CreateMaintenance(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, log)
}

func (s *Server) handleDeleteMaintenance(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteMaintenance(r.Context(), id); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
