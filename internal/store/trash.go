package store

import (
	"context"
	"fmt"
	"strconv"
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
	"songs": true, "setlists": true, "habits": true,
	// The rows that hang off one of the above, plus the two lists. Their
	// parent going in the bin already hid them; this is for deleting one on
	// its own, which used to be final.
	"project_links": true, "maintenance_logs": true, "supply_purchases": true,
	"setlist_songs": true, "attachments": true, "tasks": true,
	"journal_days":   true,
	"money_accounts": true, "budget_lines": true, "budget_incomes": true,
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

/*
restoreBare puts a row back without touching updated_by or updated_at. Several
of the child tables have no such pair, and putting a row back is not an edit of
it anyway.

The key column is named because a journal day is keyed by its date rather than
by an id.
*/
func (s *Store) restoreBare(ctx context.Context, table, column string, value any) error {
	if !softTables[table] {
		return fmt.Errorf("store: %s is not soft-deletable", table)
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(
		`update %s set deleted_at = null, deleted_by = ''
		  where %s = $1 and deleted_at is not null`, table, column), value)
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
		union all
		select 'song', id, title, coalesce(artist, ''), deleted_by, deleted_at
		  from songs where deleted_at is not null
		union all
		select 'setlist', id, name, coalesce(plays_on::text, ''), deleted_by, deleted_at
		  from setlists where deleted_at is not null
		union all
		select 'habit', id, name, coalesce(notes, ''), deleted_by, deleted_at
		  from habits where deleted_at is not null

		-- The rows that hang off something else. Their label says what they
		-- were and their detail says what they hung off, because "buku.png"
		-- on its own does not tell you which record lost it.
		union all
		select 'link', l.id, l.label, coalesce(p.name, ''), l.deleted_by, l.deleted_at
		  from project_links l
		  left join projects p on p.id = l.project_id
		 where l.deleted_at is not null
		union all
		select 'maintenance', m.id,
		       coalesce(nullif(m.description, ''), m.kind), coalesce(b.name, ''),
		       m.deleted_by, m.deleted_at
		  from maintenance_logs m
		  left join belongings b on b.id = m.belonging_id
		 where m.deleted_at is not null
		union all
		select 'purchase', x.id, coalesce(g.name, ''), x.bought_on::text,
		       x.deleted_by, x.deleted_at
		  from supply_purchases x
		  left join supplies g on g.id = x.supply_id
		 where x.deleted_at is not null
		union all
		select 'setlistsong', x.id, coalesce(g.title, ''), coalesce(l.name, ''),
		       x.deleted_by, x.deleted_at
		  from setlist_songs x
		  left join songs g on g.id = x.song_id
		  left join setlists l on l.id = x.setlist_id
		 where x.deleted_at is not null
		union all
		select 'file', id, name, entity, deleted_by, deleted_at
		  from attachments where deleted_at is not null
		union all
		select 'task', id, title, kind, deleted_by, deleted_at
		  from tasks where deleted_at is not null
		union all
		select 'account', id, name, currency, deleted_by, deleted_at
		  from money_accounts where deleted_at is not null
		union all
		-- A budget line says which month it was promised for, which is the
		-- only thing that tells two "Monthly Eats" apart.
		select 'budgetline', id, name, to_char(on_month, 'YYYY-MM'), deleted_by, deleted_at
		  from budget_lines where deleted_at is not null
		union all
		select 'budgetincome', id, name, to_char(on_month, 'YYYY-MM'), deleted_by, deleted_at
		  from budget_incomes where deleted_at is not null
		union all
		-- A journal day is keyed by its date, and the bin can only carry an
		-- id. YYYYMMDD as a number is reversible, which is the whole ask.
		select 'journal', to_char(on_date, 'YYYYMMDD')::bigint, line,
		       on_date::text, deleted_by, deleted_at
		  from journal_days where deleted_at is not null
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
/*
PurgeTrash is the one delete that really deletes. Every kind the bin can list
has to be here or its rows sit there for ever with no way out — which is what
happened to songs, setlists and habits until this was filled in.

A journal day is keyed by its date, so the bin hands its id over as YYYYMMDD
and this turns it back.
*/
func (s *Store) PurgeTrash(ctx context.Context, entity string, id int64) error {
	table := map[string]string{
		"project": "projects", "client": "clients",
		"asset": "assets", "credential": "credentials",
		"document": "documents", "belonging": "belongings", "person": "contacts",
		"supply": "supplies",
		"income": "income_streams", "expense": "expense_streams",
		"song": "songs", "setlist": "setlists", "habit": "habits",
		"link": "project_links", "maintenance": "maintenance_logs",
		"purchase": "supply_purchases", "setlistsong": "setlist_songs",
		"file": "attachments", "task": "tasks",
		"account": "money_accounts", "budgetline": "budget_lines",
		"budgetincome": "budget_incomes",
	}[entity]

	if entity == "journal" {
		day, err := time.Parse("20060102", strconv.FormatInt(id, 10))
		if err != nil {
			return ErrNotFound
		}
		return s.purge(ctx, "journal_days", "on_date", day)
	}
	if table == "" {
		return fmt.Errorf("store: unknown entity %q", entity)
	}
	return s.purge(ctx, table, "id", id)
}

// The table name never comes from a request — only from the map above — so
// interpolating it cannot turn into an injection.
func (s *Store) purge(ctx context.Context, table, column string, value any) error {
	if !softTables[table] {
		return fmt.Errorf("store: %s is not soft-deletable", table)
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(
		`delete from %s where %s = $1 and deleted_at is not null`, table, column), value)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
