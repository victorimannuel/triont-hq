package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

/*
The budgeting endpoints.

A month is addressed as YYYY-MM and never 404s: asking for one that has not
been opened yet creates it empty, because "this month" is a thing that always
exists and a page that has to be told to start is a page nobody starts.
*/

const monthParam = "2006-01"

// askedMonth reads ?month=YYYY-MM, defaulting to the one we are in. A bad
// value is refused rather than quietly treated as now: silently budgeting the
// wrong month is worse than an error.
func askedMonth(r *http.Request) (time.Time, bool) {
	raw := trim(r.URL.Query().Get("month"))
	if raw == "" {
		return time.Now(), true
	}
	month, err := time.Parse(monthParam, raw)
	if err != nil {
		return time.Time{}, false
	}
	return month, true
}

func (s *Server) handleBudget(w http.ResponseWriter, r *http.Request) {
	month, ok := askedMonth(r)
	if !ok {
		fail(w, http.StatusBadRequest, "bulan harus format YYYY-MM")
		return
	}

	budget, err := s.store.Budget(r.Context(), month, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	// The accounts ride along: every line names one, and the page would only
	// have to ask for them straight afterwards.
	accounts, err := s.store.MoneyAccounts(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"budget": budget, "accounts": accounts})
}

func (s *Server) readBudgetIncome(r *http.Request) (store.BudgetIncomeInput, string) {
	var in store.BudgetIncomeInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "sumbernya wajib diisi"
	}
	in.Notes = trim(in.Notes)
	in.Currency = valid(currencies, in.Currency, "IDR")
	if in.Amount < 0 {
		return in, "jumlahnya nggak bisa minus"
	}
	return in, ""
}

func (s *Server) handleCreateBudgetIncome(w http.ResponseWriter, r *http.Request) {
	month, ok := askedMonth(r)
	if !ok {
		fail(w, http.StatusBadRequest, "bulan harus format YYYY-MM")
		return
	}
	in, msg := s.readBudgetIncome(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	income, err := s.store.CreateBudgetIncome(r.Context(), month, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, income)
}

func (s *Server) handleUpdateBudgetIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readBudgetIncome(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	income, err := s.store.UpdateBudgetIncome(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, income)
}

func (s *Server) handleSetBudgetIncomeReceived(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		Received bool `json:"received"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	if err := s.store.SetBudgetIncomeReceived(r.Context(), id, in.Received, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteBudgetIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteBudgetIncome(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

/*
handleSeedBudget fills an empty month from the recurring expenses and from
whatever was typed into last month.

It does nothing at all to a month that already has lines, so the button is safe
to press twice — which matters, because the answer to "did that work?" on a
slow connection is usually to press it again.
*/
func (s *Server) handleSeedBudget(w http.ResponseWriter, r *http.Request) {
	month, ok := askedMonth(r)
	if !ok {
		fail(w, http.StatusBadRequest, "bulan harus format YYYY-MM")
		return
	}
	made, err := s.store.SeedBudget(r.Context(), month, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"added": made})
}

func (s *Server) readBudgetLine(r *http.Request) (store.BudgetLineInput, string) {
	var in store.BudgetLineInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "namanya wajib diisi"
	}
	in.Notes = trim(in.Notes)
	in.Bucket = valid(budgetBuckets, in.Bucket, "needs")
	if in.Percent != nil {
		if *in.Percent < 0 || *in.Percent > 100 {
			return in, "persennya harus antara 0 sampai 100"
		}
		// A line is one or the other. Keeping a stale amount beside a share
		// would leave two answers to the same question.
		in.Amount = 0
	}
	if in.Amount < 0 {
		return in, "jumlahnya nggak bisa minus"
	}
	return in, ""
}

func (s *Server) handleCreateBudgetLine(w http.ResponseWriter, r *http.Request) {
	month, ok := askedMonth(r)
	if !ok {
		fail(w, http.StatusBadRequest, "bulan harus format YYYY-MM")
		return
	}
	in, msg := s.readBudgetLine(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	line, err := s.store.CreateBudgetLine(r.Context(), month, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, line)
}

func (s *Server) handleUpdateBudgetLine(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readBudgetLine(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	line, err := s.store.UpdateBudgetLine(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, line)
}

func (s *Server) handleSetBudgetLinePaid(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		Paid bool `json:"paid"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	if err := s.store.SetBudgetLinePaid(r.Context(), id, in.Paid, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDeleteBudgetLine(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteBudgetLine(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleSetBudgetTargets(w http.ResponseWriter, r *http.Request) {
	var in map[string]float64
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	for _, bucket := range store.BudgetBuckets {
		percent, ok := in[bucket]
		if !ok {
			continue
		}
		if percent < 0 || percent > 100 {
			fail(w, http.StatusBadRequest, "persennya harus antara 0 sampai 100")
			return
		}
		if err := s.store.SetBudgetTarget(r.Context(), bucket, percent); err != nil {
			s.oops(w, err)
			return
		}
	}
	targets, err := s.store.BudgetTargets(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, targets)
}

func (s *Server) readAccount(r *http.Request) (store.MoneyAccountInput, string) {
	var in store.MoneyAccountInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama akunnya wajib diisi"
	}
	in.Notes = trim(in.Notes)
	in.Currency = valid(currencies, in.Currency, "IDR")
	return in, ""
}

func (s *Server) handleListAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := s.store.MoneyAccounts(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": accounts})
}

func (s *Server) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readAccount(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	account, err := s.store.CreateMoneyAccount(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, account)
}

func (s *Server) handleUpdateAccount(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readAccount(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	account, err := s.store.UpdateMoneyAccount(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteMoneyAccount(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
