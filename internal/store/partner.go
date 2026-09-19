package store

import (
	"context"
	"time"
)

/*
Things to get for a future partner.

The same underneath as a shopping list, minus the deadline: an idea caught now
so it is not lost, ticked off whenever it is actually bought. The one date it
keeps is the day of that purchase, and that date is also the whole of "done"
here — a row with none is still to get, a row with one is had.
*/

type PartnerItem struct {
	ID   int64  `json:"id"`
	Item string `json:"item"`
	// The day it was bought. Null is simply not yet, and is what tells the two
	// halves of the list apart.
	BoughtOn  *time.Time `json:"bought_on"`
	CreatedBy string     `json:"created_by"`
	UpdatedBy string     `json:"updated_by"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type PartnerInput struct {
	Item     string `json:"item"`
	BoughtOn string `json:"bought_on"`
}

const partnerCols = `id, item, bought_on, created_by, updated_by, created_at, updated_at`

func scanPartner(row interface{ Scan(...any) error }) (PartnerItem, error) {
	var p PartnerItem
	err := row.Scan(&p.ID, &p.Item, &p.BoughtOn, &p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// PartnerItems is the whole list in the order it is worked through: still to get
// first, then the bought ones behind them. Newest idea at the top of the first
// half; most recent purchase at the top of the second.
func (s *Store) PartnerItems(ctx context.Context) ([]PartnerItem, error) {
	rows, err := s.pool.Query(ctx, `select `+partnerCols+`
		  from partner_items where deleted_at is null
		 order by bought_on is not null, bought_on desc nulls last, created_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PartnerItem{}
	for rows.Next() {
		item, err := scanPartner(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) PartnerItemByID(ctx context.Context, id int64) (PartnerItem, error) {
	item, err := scanPartner(s.pool.QueryRow(ctx,
		`select `+partnerCols+` from partner_items where id = $1 and deleted_at is null`, id))
	return item, norm(err)
}

func (s *Store) CreatePartnerItem(ctx context.Context, in PartnerInput, actor string) (PartnerItem, error) {
	bought, err := parseDate(in.BoughtOn)
	if err != nil {
		return PartnerItem{}, err
	}
	item, err := scanPartner(s.pool.QueryRow(ctx, `
		insert into partner_items (item, bought_on, created_by, updated_by)
		values ($1, $2, $3, $3)
		returning `+partnerCols, in.Item, bought, actor))
	return item, norm(err)
}

func (s *Store) UpdatePartnerItem(ctx context.Context, id int64, in PartnerInput, actor string) (PartnerItem, error) {
	bought, err := parseDate(in.BoughtOn)
	if err != nil {
		return PartnerItem{}, err
	}
	item, err := scanPartner(s.pool.QueryRow(ctx, `
		update partner_items set item = $1, bought_on = $2, updated_by = $3, updated_at = now()
		 where id = $4 and deleted_at is null
		returning `+partnerCols, in.Item, bought, actor, id))
	return item, norm(err)
}

func (s *Store) DeletePartnerItem(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "partner_items", id, actor)
}

func (s *Store) RestorePartnerItem(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "partner_items", id, actor)
}
