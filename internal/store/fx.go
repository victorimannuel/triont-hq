package store

import (
	"context"
	"time"
)

// FxRate is how many rupiah one unit of a currency is worth, plus when that
// number was taken. The timestamp is not decoration: a converted total with no
// date on it is a number nobody can check.
type FxRate struct {
	Currency  string    `json:"currency"`
	Rate      float64   `json:"rate"`
	FetchedAt time.Time `json:"fetched_at"`
}

func (s *Store) Rates(ctx context.Context) ([]FxRate, error) {
	rows, err := s.pool.Query(ctx,
		`select currency, rate, fetched_at from fx_rates order by currency`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []FxRate{}
	for rows.Next() {
		var r FxRate
		if err := rows.Scan(&r.Currency, &r.Rate, &r.FetchedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) SaveRates(ctx context.Context, rates map[string]float64, at time.Time) error {
	batch := make([][]any, 0, len(rates))
	for currency, rate := range rates {
		batch = append(batch, []any{currency, rate, at})
	}
	for _, row := range batch {
		_, err := s.pool.Exec(ctx, `
			insert into fx_rates (currency, rate, fetched_at) values ($1, $2, $3)
			on conflict (currency) do update
			   set rate = excluded.rate, fetched_at = excluded.fetched_at`,
			row...)
		if err != nil {
			return err
		}
	}
	return nil
}
