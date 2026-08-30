package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListIncome(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	streams, err := s.store.ListIncome(r.Context(), store.IncomeFilter{
		Status:  q.Get("status"),
		Client:  q.Get("client"),
		Project: q.Get("project"),
		Query:   q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	monthly, err := s.store.MonthlyIncome(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"income": streams, "monthly": monthly})
}

func (s *Server) handleGetIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	stream, err := s.store.IncomeByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
}

func (s *Server) readIncome(r *http.Request) (store.IncomeInput, string) {
	var in store.IncomeInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama pemasukan wajib diisi"
	}
	in.Currency = valid(currencies, in.Currency, "IDR")
	in.Cycle = valid(billingCycles, in.Cycle, "monthly")
	in.Status = valid(incomeStatuses, in.Status, "active")
	in.StartedOn = trim(in.StartedOn)
	in.EndedOn = trim(in.EndedOn)
	in.NextDueOn = trim(in.NextDueOn)
	if !dateOK(in.StartedOn) || !dateOK(in.EndedOn) || !dateOK(in.NextDueOn) {
		return in, "tanggal harus format YYYY-MM-DD"
	}
	if in.Amount < 0 {
		return in, "nominal nggak boleh minus"
	}
	return in, ""
}

func (s *Server) handleCreateIncome(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readIncome(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	stream, err := s.store.CreateIncome(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, stream)
}

func (s *Server) handleUpdateIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readIncome(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	stream, err := s.store.UpdateIncome(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
}

func (s *Server) handleDeleteIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteIncome(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
