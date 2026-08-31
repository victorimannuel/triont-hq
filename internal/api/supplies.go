package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListSupplies(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	supplies, err := s.store.ListSupplies(r.Context(), store.SupplyFilter{
		Category: q.Get("category"),
		Query:    q.Get("q"),
		LowOnly:  q.Get("low") == "1",
	})
	if err != nil {
		s.oops(w, err)
		return
	}

	low := 0
	for _, item := range supplies {
		if item.Low {
			low++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"supplies": supplies, "low": low})
}

func (s *Server) handleGetSupply(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	item, err := s.store.SupplyByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	purchases, err := s.store.Purchases(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	typical, err := s.store.TypicalDays(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"supply":    item,
		"purchases": purchases,
		// How often it gets bought, averaged. Null until there are two.
		"typical_days": typical,
	})
}

func (s *Server) handleAddPurchase(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	var in store.PurchaseInput
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	in.Vendor = trim(in.Vendor)
	in.Currency = valid(currencies, in.Currency, "IDR")
	if in.Quantity <= 0 {
		fail(w, http.StatusBadRequest, "jumlah yang dibeli harus lebih dari nol")
		return
	}
	if in.Price < 0 {
		fail(w, http.StatusBadRequest, "harga nggak boleh minus")
		return
	}
	in.BoughtOn = trim(in.BoughtOn)
	if in.BoughtOn != "" {
		if _, err := time.Parse("2006-01-02", in.BoughtOn); err != nil {
			fail(w, http.StatusBadRequest, "tanggal harus format YYYY-MM-DD")
			return
		}
	}

	item, err := s.store.AddPurchase(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleDeletePurchase(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	item, err := s.store.DeletePurchase(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) readSupply(r *http.Request) (store.SupplyInput, string) {
	var in store.SupplyInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama barang wajib diisi"
	}
	in.Location = trim(in.Location)
	in.Category = valid(supplyCategories, in.Category, "other")
	in.Unit = valid(supplyUnits, in.Unit, "pcs")
	if in.Quantity < 0 || in.LowAt < 0 {
		return in, "jumlah nggak boleh minus"
	}
	in.LastRestockedOn = trim(in.LastRestockedOn)
	if in.LastRestockedOn != "" {
		if _, err := time.Parse("2006-01-02", in.LastRestockedOn); err != nil {
			return in, "tanggal harus format YYYY-MM-DD"
		}
	}
	return in, ""
}

func (s *Server) handleCreateSupply(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readSupply(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	item, err := s.store.CreateSupply(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleUpdateSupply(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readSupply(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	item, err := s.store.UpdateSupply(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// handleAdjustSupply is the one-tap path: took one, bought one. Everything
// else about this module exists to make this button worth pressing.
func (s *Server) handleAdjustSupply(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		Delta float64 `json:"delta"`
		// A corrected count. Set from having looked at the shelf, so it
		// replaces the number outright rather than nudging it.
		To *float64 `json:"to"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}

	var item store.Supply
	if in.To != nil {
		if *in.To < 0 {
			fail(w, http.StatusBadRequest, "jumlah nggak boleh minus")
			return
		}
		item, err = s.store.SetQuantity(r.Context(), id, *in.To, actor(r))
	} else {
		item, err = s.store.Adjust(r.Context(), id, in.Delta, actor(r))
	}
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleDeleteSupply(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteSupply(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
