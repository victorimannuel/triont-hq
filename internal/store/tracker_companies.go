package store

import (
	"context"
	"fmt"
	"time"
)

// A company for the tracker, editable from the app instead of hardcoded. A task
// points at it by slug, which is stable across renames, so editing the display
// name never strands a tagged task.
type TrackerCompany struct {
	ID        int64     `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

const trackerCompanyCols = `id, slug, name, created_by, updated_by, created_at, updated_at`

func scanTrackerCompany(row interface{ Scan(...any) error }) (TrackerCompany, error) {
	var c TrackerCompany
	err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

// ListTrackerCompanies is every live company, oldest first, which keeps the
// seeded one at the top and each new one after it.
func (s *Store) ListTrackerCompanies(ctx context.Context) ([]TrackerCompany, error) {
	rows, err := s.pool.Query(ctx, `select `+trackerCompanyCols+`
		  from tracker_companies where deleted_at is null
		 order by created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TrackerCompany{}
	for rows.Next() {
		c, err := scanTrackerCompany(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// uniqueCompanySlug turns a name into a slug that no live company already holds,
// appending -2, -3 and so on the way clients and projects do.
func (s *Store) uniqueCompanySlug(ctx context.Context, name string, excludeID int64) (string, error) {
	base := Slugify(name)
	candidate := base
	for n := 2; ; n++ {
		var taken bool
		if err := s.pool.QueryRow(ctx,
			`select exists (select 1 from tracker_companies
			                where slug = $1 and id <> $2 and deleted_at is null)`,
			candidate, excludeID).Scan(&taken); err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, n)
	}
}

func (s *Store) CreateTrackerCompany(ctx context.Context, name, actor string) (TrackerCompany, error) {
	slug, err := s.uniqueCompanySlug(ctx, name, 0)
	if err != nil {
		return TrackerCompany{}, err
	}
	c, err := scanTrackerCompany(s.pool.QueryRow(ctx, `
		insert into tracker_companies (slug, name, created_by, updated_by)
		values ($1, $2, $3, $3)
		returning `+trackerCompanyCols, slug, name, actor))
	return c, norm(err)
}

// UpdateTrackerCompany renames the company. The slug is left alone on purpose:
// tasks are tagged with it, and changing it would strand them.
func (s *Store) UpdateTrackerCompany(ctx context.Context, id int64, name, actor string) (TrackerCompany, error) {
	c, err := scanTrackerCompany(s.pool.QueryRow(ctx, `
		update tracker_companies set name = $1, updated_by = $2, updated_at = now()
		 where id = $3 and deleted_at is null
		returning `+trackerCompanyCols, name, actor, id))
	return c, norm(err)
}

func (s *Store) DeleteTrackerCompany(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "tracker_companies", id, actor)
}

// RestoreTrackerCompany brings a soft-deleted company back. It can fail on the
// live-slug index if the same name was added again in the meantime, which the
// API turns into a readable message.
func (s *Store) RestoreTrackerCompany(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "tracker_companies", id, actor)
}
