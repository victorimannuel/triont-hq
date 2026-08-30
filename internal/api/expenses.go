package api

import (
	"net/http"
	"sort"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListExpenses(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	streams, err := s.store.ListExpenses(r.Context(), store.ExpenseFilter{
		Status:   q.Get("status"),
		Category: q.Get("category"),
		Query:    q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	// Paid assets nobody has written an expense row for join the list as
	// read-only lines, so the page adds up to what actually goes out.
	fromAssets, err := s.store.AssetExpenses(r.Context(), store.ExpenseFilter{
		Status:   q.Get("status"),
		Category: q.Get("category"),
		Query:    q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	streams = append(streams, fromAssets...)
	sort.SliceStable(streams, func(i, j int) bool {
		a, b := streams[i], streams[j]
		if rank(a.Status) != rank(b.Status) {
			return rank(a.Status) < rank(b.Status)
		}
		if (a.NextDueOn == nil) != (b.NextDueOn == nil) {
			return a.NextDueOn != nil
		}
		if a.NextDueOn != nil && !a.NextDueOn.Equal(*b.NextDueOn) {
			return a.NextDueOn.Before(*b.NextDueOn)
		}
		return a.Name < b.Name
	})

	monthly, err := s.store.MonthlyExpense(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"expenses": streams, "monthly": monthly})
}

func (s *Server) handleGetExpense(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	stream, err := s.store.ExpenseByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
}

func (s *Server) readExpense(r *http.Request) (store.ExpenseInput, string) {
	var in store.ExpenseInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama pengeluaran wajib diisi"
	}
	in.Category = valid(expenseCategories, in.Category, "other")
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

func (s *Server) handleCreateExpense(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readExpense(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	stream, err := s.store.CreateExpense(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, stream)
}

func (s *Server) handleUpdateExpense(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readExpense(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	stream, err := s.store.UpdateExpense(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
}

func (s *Server) handleDeleteExpense(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteExpense(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Active first, then paused, then everything finished.
func rank(status string) int {
	switch status {
	case "active":
		return 0
	case "paused":
		return 1
	default:
		return 2
	}
}
