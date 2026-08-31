package store

import (
	"context"
	"strings"
	"time"
)

// Supply is something that gets used up: tissue, cotton buds, cooking oil.
// Unlike a belonging it has no warranty and never gets serviced — the only
// question it answers is "how much is left, and should I buy more".
type Supply struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Location string  `json:"location"`
	Unit     string  `json:"unit"`
	Quantity float64 `json:"quantity"`
	// The level at or below which this counts as running out.
	LowAt float64 `json:"low_at"`
	// True when quantity has reached the threshold. Computed, not stored, so
	// it cannot disagree with the numbers it is derived from.
	Low             bool       `json:"low"`
	Notes           string     `json:"notes"`
	LastRestockedOn *time.Time `json:"last_restocked_on"`
	CreatedBy       string     `json:"created_by"`
	UpdatedBy       string     `json:"updated_by"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type SupplyInput struct {
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	Location        string  `json:"location"`
	Unit            string  `json:"unit"`
	Quantity        float64 `json:"quantity"`
	LowAt           float64 `json:"low_at"`
	Notes           string  `json:"notes"`
	LastRestockedOn string  `json:"last_restocked_on"`
}

type SupplyFilter struct {
	Category string
	Query    string
	// Only what needs buying. This is the shopping list.
	LowOnly bool
}

const supplyCols = `id, name, category, location, unit, quantity, low_at,
	quantity <= low_at, notes, last_restocked_on,
	created_by, updated_by, created_at, updated_at`

func scanSupply(row interface{ Scan(...any) error }) (Supply, error) {
	var s Supply
	err := row.Scan(&s.ID, &s.Name, &s.Category, &s.Location, &s.Unit,
		&s.Quantity, &s.LowAt, &s.Low, &s.Notes, &s.LastRestockedOn,
		&s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (s *Store) ListSupplies(ctx context.Context, f SupplyFilter) ([]Supply, error) {
	rows, err := s.pool.Query(ctx, `select `+supplyCols+`
		  from supplies
		 where deleted_at is null
		   and ($1 = '' or category = $1)
		   and ($2 = '' or name ilike '%' || $2 || '%'
		                or location ilike '%' || $2 || '%'
		                or notes ilike '%' || $2 || '%')
		   and (not $3 or quantity <= low_at)
		 -- By name, like every other list. What is running out is a badge and
		 -- a filter button, not a reason to shuffle the rows.
		 order by lower(name)`,
		f.Category, strings.TrimSpace(f.Query), f.LowOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Supply{}
	for rows.Next() {
		item, err := scanSupply(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) SupplyByID(ctx context.Context, id int64) (Supply, error) {
	item, err := scanSupply(s.pool.QueryRow(ctx,
		`select `+supplyCols+` from supplies where id = $1 and deleted_at is null`, id))
	return item, norm(err)
}

func (s *Store) CreateSupply(ctx context.Context, in SupplyInput, actor string) (Supply, error) {
	restocked, err := parseDate(in.LastRestockedOn)
	if err != nil {
		return Supply{}, err
	}
	item, err := scanSupply(s.pool.QueryRow(ctx, `
		insert into supplies (name, category, location, unit, quantity, low_at,
		                      notes, last_restocked_on, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
		returning `+supplyCols,
		in.Name, in.Category, in.Location, in.Unit, in.Quantity, in.LowAt,
		in.Notes, restocked, actor))
	return item, norm(err)
}

func (s *Store) UpdateSupply(ctx context.Context, id int64, in SupplyInput, actor string) (Supply, error) {
	restocked, err := parseDate(in.LastRestockedOn)
	if err != nil {
		return Supply{}, err
	}
	item, err := scanSupply(s.pool.QueryRow(ctx, `
		update supplies set name = $1, category = $2, location = $3, unit = $4,
		       quantity = $5, low_at = $6, notes = $7, last_restocked_on = $8,
		       updated_by = $9, updated_at = now()
		 where id = $10 and deleted_at is null
		returning `+supplyCols,
		in.Name, in.Category, in.Location, in.Unit, in.Quantity, in.LowAt,
		in.Notes, restocked, actor, id))
	return item, norm(err)
}

// Adjust nudges the count without opening the form. Taking one tissue box off
// the shelf should cost one tap, which is the only reason this list gets kept
// up to date at all. Quantity never goes below zero.
func (s *Store) Adjust(ctx context.Context, id int64, delta float64, actor string) (Supply, error) {
	item, err := scanSupply(s.pool.QueryRow(ctx, `
		update supplies
		   set quantity = greatest(0, quantity + $2),
		       updated_by = $3, updated_at = now()
		 where id = $1 and deleted_at is null
		returning `+supplyCols, id, delta, actor))
	return item, norm(err)
}

// SetQuantity is for a miscount: the shelf says three, the record said five.
// It deliberately leaves last_restocked_on alone — nothing was bought, and a
// correction that moved that date would poison the "how often" average.
func (s *Store) SetQuantity(ctx context.Context, id int64, to float64, actor string) (Supply, error) {
	item, err := scanSupply(s.pool.QueryRow(ctx, `
		update supplies
		   set quantity = $2, updated_by = $3, updated_at = now()
		 where id = $1 and deleted_at is null
		returning `+supplyCols, id, to, actor))
	return item, norm(err)
}

func (s *Store) DeleteSupply(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "supplies", id, actor)
}

func (s *Store) RestoreSupply(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "supplies", id, actor)
}

// LowSupplies is the shopping list, used by the home page and the morning
// reminder alike.
func (s *Store) LowSupplies(ctx context.Context) ([]Supply, error) {
	return s.ListSupplies(ctx, SupplyFilter{LowOnly: true})
}

// SupplyPurchase is one shopping trip's worth of one item.
type SupplyPurchase struct {
	ID        int64     `json:"id"`
	SupplyID  int64     `json:"supply_id"`
	BoughtOn  time.Time `json:"bought_on"`
	Quantity  float64   `json:"quantity"`
	Price     float64   `json:"price"`
	Currency  string    `json:"currency"`
	Vendor    string    `json:"vendor"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	// Days since the purchase before this one. Null for the first. This is
	// what makes "a pack lasts about three weeks" answerable.
	SinceLast *int `json:"since_last"`
}

type PurchaseInput struct {
	BoughtOn string  `json:"bought_on"`
	Quantity float64 `json:"quantity"`
	Price    float64 `json:"price"`
	Currency string  `json:"currency"`
	Vendor   string  `json:"vendor"`
	Notes    string  `json:"notes"`
}

const purchaseCols = `id, supply_id, bought_on, quantity, price, currency,
	vendor, notes, created_by, created_at,
	-- The gap to the previous purchase, computed here so the page does not
	-- have to sort dates itself to say anything useful.
	(bought_on - lag(bought_on) over (partition by supply_id order by bought_on))::int`

func scanPurchase(row interface{ Scan(...any) error }) (SupplyPurchase, error) {
	var p SupplyPurchase
	err := row.Scan(&p.ID, &p.SupplyID, &p.BoughtOn, &p.Quantity, &p.Price,
		&p.Currency, &p.Vendor, &p.Notes, &p.CreatedBy, &p.CreatedAt, &p.SinceLast)
	return p, err
}

func (s *Store) Purchases(ctx context.Context, supplyID int64) ([]SupplyPurchase, error) {
	rows, err := s.pool.Query(ctx, `
		select * from (select `+purchaseCols+`
		                 from supply_purchases where supply_id = $1) p
		 order by bought_on desc, id desc`, supplyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []SupplyPurchase{}
	for rows.Next() {
		item, err := scanPurchase(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// AddPurchase records the buy and puts the stock up by the same amount, in one
// transaction: a purchase that did not move the count would be a lie, and a
// count moved without a purchase behind it loses the history.
func (s *Store) AddPurchase(ctx context.Context, supplyID int64, in PurchaseInput, actor string) (Supply, error) {
	bought, err := parseDate(in.BoughtOn)
	if err != nil {
		return Supply{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Supply{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		insert into supply_purchases (supply_id, bought_on, quantity, price,
		                              currency, vendor, notes, created_by)
		values ($1, coalesce($2, current_date), $3, $4, $5, $6, $7, $8)`,
		supplyID, bought, in.Quantity, in.Price, in.Currency,
		in.Vendor, in.Notes, actor); err != nil {
		return Supply{}, norm(err)
	}

	if _, err := tx.Exec(ctx, `
		update supplies
		   set quantity = quantity + $2,
		       last_restocked_on = greatest(coalesce(last_restocked_on, '0001-01-01'),
		                                    coalesce($3::date, current_date)),
		       updated_by = $4, updated_at = now()
		 where id = $1 and deleted_at is null`,
		supplyID, in.Quantity, bought, actor); err != nil {
		return Supply{}, norm(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Supply{}, err
	}
	return s.SupplyByID(ctx, supplyID)
}

// DeletePurchase takes the stock back down with it, so undoing a mistyped
// purchase leaves the count where it started.
func (s *Store) DeletePurchase(ctx context.Context, id int64) (Supply, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Supply{}, err
	}
	defer tx.Rollback(ctx)

	var supplyID int64
	var quantity float64
	if err := tx.QueryRow(ctx, `
		delete from supply_purchases where id = $1
		returning supply_id, quantity`, id).Scan(&supplyID, &quantity); err != nil {
		return Supply{}, norm(err)
	}
	if _, err := tx.Exec(ctx, `
		update supplies set quantity = greatest(0, quantity - $2), updated_at = now()
		 where id = $1`, supplyID, quantity); err != nil {
		return Supply{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Supply{}, err
	}
	return s.SupplyByID(ctx, supplyID)
}

// TypicalDays is how often this gets bought, averaged over its history. Nil
// until there are two purchases to measure between.
func (s *Store) TypicalDays(ctx context.Context, supplyID int64) (*int, error) {
	var days *float64
	err := s.pool.QueryRow(ctx, `
		select avg(gap) from (
		  select (bought_on - lag(bought_on) over (order by bought_on))::int as gap
		    from supply_purchases where supply_id = $1
		) g where gap is not null`, supplyID).Scan(&days)
	if err != nil || days == nil {
		return nil, err
	}
	rounded := int(*days + 0.5)
	return &rounded, nil
}
