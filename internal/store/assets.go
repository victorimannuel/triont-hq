package store

import (
	"context"
	"strings"
	"time"
)

// Every asset query shares one column list and one FROM. They used to be
// copied per query, and adding a column to one copy is exactly how the
// overview started returning 500s.
const assetCols = `a.id, a.name, a.kind, a.provider, a.identifier, a.status,
	a.cost_amount, a.cost_currency, a.billing_cycle, a.renews_on, a.auto_renew, a.notes,
	a.credential_id, coalesce(c.label, ''), coalesce(c.username, ''),
	a.created_by, a.updated_by, a.created_at, a.updated_at`

// The credential is joined for its label only; the asset stands on its own if
// the credential is later thrown away.
const assetFrom = ` from assets a
	left join credentials c on c.id = a.credential_id and c.deleted_at is null`

const assetSelect = `select ` + assetCols + assetFrom

// scanAssetCounted reads assetCols plus the trailing project count. Keeping it
// next to the column list is what stops the two drifting apart again.
func scanAssetCounted(row interface{ Scan(...any) error }) (Asset, error) {
	var a Asset
	err := row.Scan(&a.ID, &a.Name, &a.Kind, &a.Provider, &a.Identifier, &a.Status,
		&a.CostAmount, &a.CostCurrency, &a.BillingCycle, &a.RenewsOn, &a.AutoRenew, &a.Notes,
		&a.CredentialID, &a.CredentialLabel, &a.CredentialUser,
		&a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt, &a.ProjectCount)
	return a, err
}

func scanAsset(row interface{ Scan(...any) error }) (Asset, error) {
	var a Asset
	err := row.Scan(&a.ID, &a.Name, &a.Kind, &a.Provider, &a.Identifier, &a.Status,
		&a.CostAmount, &a.CostCurrency, &a.BillingCycle, &a.RenewsOn, &a.AutoRenew, &a.Notes,
		&a.CredentialID, &a.CredentialLabel, &a.CredentialUser,
		&a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

// parseDate turns the "YYYY-MM-DD" the form sends into a nullable date. An
// empty string means "no renewal date", not "today".
func parseDate(v string) (*time.Time, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Store) ListAssets(ctx context.Context, f AssetFilter) ([]Asset, error) {
	rows, err := s.pool.Query(ctx, `select `+assetCols+`,
		       (select count(*) from project_assets pa where pa.asset_id = a.id)`+
		assetFrom+`
		where a.deleted_at is null
		  and ($1 = '' or a.kind = $1)
		  and ($2 = '' or a.status = $2)
		  and ($3 = '' or a.name ilike '%' || $3 || '%'
		                or a.provider ilike '%' || $3 || '%'
		                or a.identifier ilike '%' || $3 || '%')
		  and ($4 = '' or exists (
		        select 1 from project_assets pa
		          join projects p on p.id = pa.project_id
		         where pa.asset_id = a.id and p.slug = $4))
		-- Kind first, in the order the form offers it rather than alphabetically:
		-- that keeps the things there are most of at the top and "lainnya" at the
		-- bottom. An unknown kind sorts last, which is what a null does by default.
		order by array_position(
		           array['vps','hosting','domain','ssl','saas','license','other'], a.kind),
		         a.kind, a.renews_on nulls last, a.name`,
		f.Kind, f.Status, strings.TrimSpace(f.Query), f.Project)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Asset{}
	for rows.Next() {
		a, err := scanAssetCounted(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) AssetByID(ctx context.Context, id int64) (Asset, error) {
	a, err := scanAsset(s.pool.QueryRow(ctx,
		assetSelect+` where a.id = $1 and a.deleted_at is null`, id))
	if err != nil {
		return a, norm(err)
	}
	if a.Projects, err = s.ProjectsForAsset(ctx, id); err != nil {
		return a, err
	}
	a.ProjectCount = len(a.Projects)
	return a, nil
}

func (s *Store) CreateAsset(ctx context.Context, in AssetInput, actor string) (Asset, error) {
	renews, err := parseDate(in.RenewsOn)
	if err != nil {
		return Asset{}, err
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		insert into assets (name, kind, provider, identifier, status, cost_amount,
		                    cost_currency, billing_cycle, renews_on, auto_renew, notes,
		                    credential_id, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
		returning id`,
		in.Name, in.Kind, in.Provider, in.Identifier, in.Status, in.CostAmount,
		in.CostCurrency, in.BillingCycle, renews, in.AutoRenew, in.Notes,
		in.CredentialID, actor).Scan(&id)
	if err != nil {
		return Asset{}, norm(err)
	}
	return s.AssetByID(ctx, id)
}

func (s *Store) UpdateAsset(ctx context.Context, id int64, in AssetInput, actor string) (Asset, error) {
	renews, err := parseDate(in.RenewsOn)
	if err != nil {
		return Asset{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update assets set name = $1, kind = $2, provider = $3, identifier = $4,
		       status = $5, cost_amount = $6, cost_currency = $7, billing_cycle = $8,
		       renews_on = $9, auto_renew = $10, notes = $11, credential_id = $12,
		       updated_by = $13, updated_at = now()
		 where id = $14 and deleted_at is null`,
		in.Name, in.Kind, in.Provider, in.Identifier, in.Status, in.CostAmount,
		in.CostCurrency, in.BillingCycle, renews, in.AutoRenew, in.Notes,
		in.CredentialID, actor, id)
	if err != nil {
		return Asset{}, norm(err)
	}
	if tag.RowsAffected() == 0 {
		return Asset{}, ErrNotFound
	}
	return s.AssetByID(ctx, id)
}

func (s *Store) DeleteAsset(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "assets", id, actor)
}

func (s *Store) RestoreAsset(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "assets", id, actor)
}

// AttachAsset is idempotent: re-attaching only updates the role, so a double
// click cannot fail with a duplicate key.
func (s *Store) AttachAsset(ctx context.Context, projectID, assetID int64, role string) error {
	_, err := s.pool.Exec(ctx, `
		insert into project_assets (project_id, asset_id, role) values ($1, $2, $3)
		on conflict (project_id, asset_id) do update set role = excluded.role`,
		projectID, assetID, role)
	return norm(err)
}

func (s *Store) DetachAsset(ctx context.Context, projectID, assetID int64) error {
	tag, err := s.pool.Exec(ctx,
		`delete from project_assets where project_id = $1 and asset_id = $2`, projectID, assetID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) AssetsForProject(ctx context.Context, projectID int64) ([]AssetUsage, error) {
	rows, err := s.pool.Query(ctx, `
		select pa.project_id, '', '', a.id, a.name, a.kind, a.provider, a.identifier, pa.role
		from project_assets pa
		join assets a on a.id = pa.asset_id and a.deleted_at is null
		where pa.project_id = $1
		order by a.kind, a.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AssetUsage{}
	for rows.Next() {
		var u AssetUsage
		if err := rows.Scan(&u.ProjectID, &u.ProjectSlug, &u.ProjectName, &u.AssetID,
			&u.AssetName, &u.AssetKind, &u.Provider, &u.Identifier, &u.Role); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) ProjectsForAsset(ctx context.Context, assetID int64) ([]AssetUsage, error) {
	rows, err := s.pool.Query(ctx, `
		select p.id, p.slug, p.name, pa.asset_id, '', '', '', '', pa.role
		from project_assets pa
		join projects p on p.id = pa.project_id and p.deleted_at is null
		where pa.asset_id = $1
		order by p.name`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AssetUsage{}
	for rows.Next() {
		var u AssetUsage
		if err := rows.Scan(&u.ProjectID, &u.ProjectSlug, &u.ProjectName, &u.AssetID,
			&u.AssetName, &u.AssetKind, &u.Provider, &u.Identifier, &u.Role); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// RenewalsDue lists live assets whose renewal falls inside the next `days`,
// plus anything already overdue, so nothing silently slips past.
func (s *Store) RenewalsDue(ctx context.Context, days int) ([]Asset, error) {
	rows, err := s.pool.Query(ctx, `select `+assetCols+`,
		       (select count(*) from project_assets pa where pa.asset_id = a.id)`+
		assetFrom+`
		where a.deleted_at is null
		  and a.status = 'active'
		  and a.renews_on is not null
		  and a.renews_on <= current_date + make_interval(days => $1)
		order by a.renews_on`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Asset{}
	for rows.Next() {
		a, err := scanAssetCounted(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) CountAssets(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*) from assets where deleted_at is null`).Scan(&n)
	return n, err
}
