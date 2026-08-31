package store

import (
	"context"
	"fmt"
	"time"
)

// TrashItem is one soft-deleted row, flattened so the trash page can show
// projects, clients, assets and credentials in a single list.
type TrashItem struct {
	Entity    string    `json:"entity"`
	ID        int64     `json:"id"`
	Label     string    `json:"label"`
	Detail    string    `json:"detail"`
	DeletedBy string    `json:"deleted_by"`
	DeletedAt time.Time `json:"deleted_at"`
}

// The table name never comes from user input — only from the callers below —
// so interpolating it here cannot turn into an injection.
var softTables = map[string]bool{
	"projects": true, "clients": true, "assets": true,
	"credentials": true, "documents": true,
	"belongings": true, "contacts": true, "supplies": true,
	"income_streams": true, "expense_streams": true,
}

func (s *Store) softDelete(ctx context.Context, table, column, value, actor string) error {
	if !softTables[table] {
		return fmt.Errorf("store: %s is not soft-deletable", table)
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(
		`update %s set deleted_at = now(), deleted_by = $2
		  where %s = $1 and deleted_at is null`, table, column), value, actor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) softDeleteByID(ctx context.Context, table string, id int64, actor string) error {
	if !softTables[table] {
		return fmt.Errorf("store: %s is not soft-deletable", table)
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(
		`update %s set deleted_at = now(), deleted_by = $2
		  where id = $1 and deleted_at is null`, table), id, actor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// restore clears the stamp. It can fail on a unique slug if something new took
// the name in the meantime; the caller turns that into a readable message.
func (s *Store) restore(ctx context.Context, table string, id int64, actor string) error {
	if !softTables[table] {
		return fmt.Errorf("store: %s is not soft-deletable", table)
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(
		`update %s set deleted_at = null, deleted_by = '', updated_by = $2, updated_at = now()
		  where id = $1 and deleted_at is not null`, table), id, actor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListTrash(ctx context.Context) ([]TrashItem, error) {
	rows, err := s.pool.Query(ctx, `
		select 'project', id, name, coalesce(local_path, ''), deleted_by, deleted_at
		  from projects where deleted_at is not null
		union all
		select 'client', id, name, coalesce(company, ''), deleted_by, deleted_at
		  from clients where deleted_at is not null
		union all
		select 'asset', id, name, coalesce(identifier, ''), deleted_by, deleted_at
		  from assets where deleted_at is not null
		union all
		select 'credential', id, label, coalesce(host, ''), deleted_by, deleted_at
		  from credentials where deleted_at is not null
		union all
		select 'document', id, name, coalesce(holder, ''), deleted_by, deleted_at
		  from documents where deleted_at is not null
		union all
		select 'belonging', id, name, coalesce(brand, ''), deleted_by, deleted_at
		  from belongings where deleted_at is not null

		union all
		select 'supply', id, name, coalesce(location, ''), deleted_by, deleted_at
		  from supplies where deleted_at is not null
		union all
		select 'person', id, name, coalesce(role, ''), deleted_by, deleted_at
		  from contacts where deleted_at is not null
		union all
		select 'income', id, name, coalesce(currency, ''), deleted_by, deleted_at
		  from income_streams where deleted_at is not null
		union all
		select 'expense', id, name, coalesce(category, ''), deleted_by, deleted_at
		  from expense_streams where deleted_at is not null
		order by 6 desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TrashItem{}
	for rows.Next() {
		var t TrashItem
		if err := rows.Scan(&t.Entity, &t.ID, &t.Label, &t.Detail,
			&t.DeletedBy, &t.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// PurgeTrash removes for real. Only reachable from the explicit "buang
// permanen" action, never from an ordinary delete.
func (s *Store) PurgeTrash(ctx context.Context, entity string, id int64) error {
	table := map[string]string{
		"project": "projects", "client": "clients",
		"asset": "assets", "credential": "credentials",
		"document": "documents", "belonging": "belongings", "person": "contacts",
		"supply": "supplies",
		"income": "income_streams", "expense": "expense_streams",
	}[entity]
	if table == "" {
		return fmt.Errorf("store: unknown entity %q", entity)
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(
		`delete from %s where id = $1 and deleted_at is not null`, table), id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
