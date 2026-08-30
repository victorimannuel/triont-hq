package store

import (
	"context"
	"strings"
	"time"
)

// Belonging is something you own: a car, a fridge, a laptop, a house. The list
// alone is dull; the maintenance log hanging off it is the point.
type Belonging struct {
	ID            int64      `json:"id"`
	Name          string     `json:"name"`
	Kind          string     `json:"kind"`
	Brand         string     `json:"brand"`
	Model         string     `json:"model"`
	Year          *int       `json:"year"`
	Identifier    string     `json:"identifier"`
	AcquiredOn    *time.Time `json:"acquired_on"`
	Price         float64    `json:"price"`
	Currency      string     `json:"currency"`
	WarrantyUntil *time.Time `json:"warranty_until"`
	Location      string     `json:"location"`
	Ownership     string     `json:"ownership"`
	Condition     string     `json:"condition"`
	RentAmount    float64    `json:"rent_amount"`
	RentCycle     string     `json:"rent_cycle"`
	RentDueOn     *time.Time `json:"rent_due_on"`
	Status        string     `json:"status"`
	Notes         string     `json:"notes"`
	CreatedBy     string     `json:"created_by"`
	UpdatedBy     string     `json:"updated_by"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`

	NextDue *time.Time       `json:"next_due"`
	Logs    []MaintenanceLog `json:"logs,omitempty"`
	Tags    []Tag            `json:"tags"`
}

type BelongingInput struct {
	Name          string  `json:"name"`
	Kind          string  `json:"kind"`
	Brand         string  `json:"brand"`
	Model         string  `json:"model"`
	Year          *int    `json:"year"`
	Identifier    string  `json:"identifier"`
	AcquiredOn    string  `json:"acquired_on"`
	Price         float64 `json:"price"`
	Currency      string  `json:"currency"`
	WarrantyUntil string  `json:"warranty_until"`
	Location      string  `json:"location"`
	Ownership     string  `json:"ownership"`
	Condition     string  `json:"condition"`
	RentAmount    float64 `json:"rent_amount"`
	RentCycle     string  `json:"rent_cycle"`
	RentDueOn     string  `json:"rent_due_on"`
	Status        string  `json:"status"`
	Notes         string  `json:"notes"`
}

type MaintenanceLog struct {
	ID          int64      `json:"id"`
	BelongingID int64      `json:"belonging_id"`
	DoneOn      time.Time  `json:"done_on"`
	Kind        string     `json:"kind"`
	Odometer    *int       `json:"odometer"`
	Description string     `json:"description"`
	Vendor      string     `json:"vendor"`
	Cost        float64    `json:"cost"`
	NextDue     *time.Time `json:"next_due"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
}

type MaintenanceInput struct {
	DoneOn      string  `json:"done_on"`
	Kind        string  `json:"kind"`
	Odometer    *int    `json:"odometer"`
	Description string  `json:"description"`
	Vendor      string  `json:"vendor"`
	Cost        float64 `json:"cost"`
	NextDue     string  `json:"next_due"`
}

type BelongingFilter struct {
	Kind   string
	Status string
	Query  string
}

const belongingCols = `b.id, b.name, b.kind, b.brand, b.model, b.year, b.identifier,
	b.acquired_on, b.price, b.currency, b.warranty_until, b.location,
	b.ownership, b.condition, b.rent_amount, b.rent_cycle, b.rent_due_on, b.status, b.notes,
	b.created_by, b.updated_by, b.created_at, b.updated_at,
	(select min(m.next_due) from maintenance_logs m
	  where m.belonging_id = b.id and m.next_due >= current_date)`

func scanBelonging(row interface{ Scan(...any) error }) (Belonging, error) {
	var b Belonging
	err := row.Scan(&b.ID, &b.Name, &b.Kind, &b.Brand, &b.Model, &b.Year, &b.Identifier,
		&b.AcquiredOn, &b.Price, &b.Currency, &b.WarrantyUntil, &b.Location,
		&b.Ownership, &b.Condition, &b.RentAmount, &b.RentCycle, &b.RentDueOn, &b.Status,
		&b.Notes, &b.CreatedBy, &b.UpdatedBy, &b.CreatedAt, &b.UpdatedAt, &b.NextDue)
	return b, err
}

func (s *Store) ListBelongings(ctx context.Context, f BelongingFilter) ([]Belonging, error) {
	rows, err := s.pool.Query(ctx, `select `+belongingCols+`
		from belongings b
		where b.deleted_at is null
		  and ($1 = '' or b.kind = $1)
		  and ($2 = '' or b.status = $2)
		  and ($3 = '' or b.name ilike '%' || $3 || '%'
		                or b.brand ilike '%' || $3 || '%'
		                or b.model ilike '%' || $3 || '%'
		                or b.identifier ilike '%' || $3 || '%'
		                or b.location ilike '%' || $3 || '%')
		order by b.kind, b.name`, f.Kind, f.Status, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Belonging{}
	for rows.Next() {
		b, err := scanBelonging(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ids := make([]int64, len(out))
	for i, b := range out {
		ids[i] = b.ID
	}
	byItem, err := s.TagsForMany(ctx, "belonging", ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Tags = byItem[out[i].ID]
	}
	return out, nil
}

func (s *Store) BelongingByID(ctx context.Context, id int64) (Belonging, error) {
	b, err := scanBelonging(s.pool.QueryRow(ctx,
		`select `+belongingCols+` from belongings b where b.id = $1 and b.deleted_at is null`, id))
	if err != nil {
		return b, norm(err)
	}
	if b.Logs, err = s.MaintenanceFor(ctx, id); err != nil {
		return b, err
	}
	if b.Tags, err = s.TagsFor(ctx, "belonging", id); err != nil {
		return b, err
	}
	return b, nil
}

func (s *Store) CreateBelonging(ctx context.Context, in BelongingInput, actor string) (Belonging, error) {
	acquired, err := parseDate(in.AcquiredOn)
	if err != nil {
		return Belonging{}, err
	}
	warranty, err := parseDate(in.WarrantyUntil)
	if err != nil {
		return Belonging{}, err
	}
	rentDue, err := parseDate(in.RentDueOn)
	if err != nil {
		return Belonging{}, err
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		insert into belongings (name, kind, brand, model, year, identifier, acquired_on,
		                        price, currency, warranty_until, location, ownership,
		                        condition, rent_amount, rent_cycle, rent_due_on, status, notes,
		                        created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
		returning id`,
		in.Name, in.Kind, in.Brand, in.Model, in.Year, in.Identifier, acquired,
		in.Price, in.Currency, warranty, in.Location, in.Ownership, in.Condition,
		in.RentAmount, in.RentCycle, rentDue, in.Status, in.Notes, actor).Scan(&id)
	if err != nil {
		return Belonging{}, norm(err)
	}
	return s.BelongingByID(ctx, id)
}

func (s *Store) UpdateBelonging(ctx context.Context, id int64, in BelongingInput, actor string) (Belonging, error) {
	acquired, err := parseDate(in.AcquiredOn)
	if err != nil {
		return Belonging{}, err
	}
	warranty, err := parseDate(in.WarrantyUntil)
	if err != nil {
		return Belonging{}, err
	}
	rentDue, err := parseDate(in.RentDueOn)
	if err != nil {
		return Belonging{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update belongings set name = $1, kind = $2, brand = $3, model = $4, year = $5,
		       identifier = $6, acquired_on = $7, price = $8, currency = $9,
		       warranty_until = $10, location = $11, ownership = $12, condition = $13,
		       rent_amount = $14, rent_cycle = $15, rent_due_on = $16, status = $17,
		       notes = $18, updated_by = $19, updated_at = now()
		 where id = $20 and deleted_at is null`,
		in.Name, in.Kind, in.Brand, in.Model, in.Year, in.Identifier, acquired,
		in.Price, in.Currency, warranty, in.Location, in.Ownership, in.Condition,
		in.RentAmount, in.RentCycle, rentDue, in.Status, in.Notes, actor, id)
	if err != nil {
		return Belonging{}, err
	}
	if tag.RowsAffected() == 0 {
		return Belonging{}, ErrNotFound
	}
	return s.BelongingByID(ctx, id)
}

func (s *Store) DeleteBelonging(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "belongings", id, actor)
}

func (s *Store) RestoreBelonging(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "belongings", id, actor)
}

const maintenanceCols = `id, belonging_id, done_on, kind, odometer, description,
	vendor, cost, next_due, created_by, created_at`

func scanMaintenance(row interface{ Scan(...any) error }) (MaintenanceLog, error) {
	var m MaintenanceLog
	err := row.Scan(&m.ID, &m.BelongingID, &m.DoneOn, &m.Kind, &m.Odometer,
		&m.Description, &m.Vendor, &m.Cost, &m.NextDue, &m.CreatedBy, &m.CreatedAt)
	return m, err
}

func (s *Store) MaintenanceFor(ctx context.Context, belongingID int64) ([]MaintenanceLog, error) {
	rows, err := s.pool.Query(ctx, `select `+maintenanceCols+`
		from maintenance_logs where belonging_id = $1
		order by done_on desc, id desc`, belongingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []MaintenanceLog{}
	for rows.Next() {
		m, err := scanMaintenance(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) CreateMaintenance(ctx context.Context, belongingID int64, in MaintenanceInput, actor string) (MaintenanceLog, error) {
	done, err := parseDate(in.DoneOn)
	if err != nil {
		return MaintenanceLog{}, err
	}
	next, err := parseDate(in.NextDue)
	if err != nil {
		return MaintenanceLog{}, err
	}
	m, err := scanMaintenance(s.pool.QueryRow(ctx, `
		insert into maintenance_logs (belonging_id, done_on, kind, odometer, description,
		                              vendor, cost, next_due, created_by)
		values ($1, coalesce($2, current_date), $3, $4, $5, $6, $7, $8, $9)
		returning `+maintenanceCols,
		belongingID, done, in.Kind, in.Odometer, in.Description,
		in.Vendor, in.Cost, next, actor))
	return m, norm(err)
}

func (s *Store) DeleteMaintenance(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `delete from maintenance_logs where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CountBelongings(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`select count(*) from belongings where deleted_at is null`).Scan(&n)
	return n, err
}
