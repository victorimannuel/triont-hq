package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// open.er-api.com is free and needs no key. Rates are quoted against USD, so
// everything else is derived from that one response.
const fxEndpoint = "https://open.er-api.com/v6/latest/USD"

type fxResponse struct {
	Result string             `json:"result"`
	Rates  map[string]float64 `json:"rates"`
}

func (s *Server) handleRates(w http.ResponseWriter, r *http.Request) {
	rates, err := s.store.Rates(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rates": rates})
}

// handleRefreshRates pulls fresh numbers on demand. It is a POST because it
// reaches out to the internet and writes; nothing refreshes on its own, so the
// date shown next to a converted figure is always one you asked for.
func (s *Server) handleRefreshRates(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	rates, err := fetchRates(ctx)
	if err != nil {
		s.log.Error("fx refresh failed", "err", err)
		fail(w, http.StatusBadGateway, "gagal ambil kurs, coba lagi nanti")
		return
	}
	if err := s.store.SaveRates(r.Context(), rates, time.Now()); err != nil {
		s.oops(w, err)
		return
	}

	saved, err := s.store.Rates(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rates": saved})
}

func fetchRates(ctx context.Context) (map[string]float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fxEndpoint, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fx: upstream returned %d", res.StatusCode)
	}

	var body fxResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	idr, ok := body.Rates["IDR"]
	if !ok || idr <= 0 {
		return nil, fmt.Errorf("fx: no IDR rate in response")
	}

	// Everything is stored as "one unit of X is worth N rupiah".
	out := map[string]float64{"IDR": 1}
	for _, code := range []string{"USD", "SGD", "EUR"} {
		perUSD, ok := body.Rates[code]
		if !ok || perUSD <= 0 {
			continue
		}
		out[code] = idr / perUSD
	}
	return out, nil
}
