package store

import (
	"context"
	"fmt"
	"strings"
)

const clientColumns = `id, slug, name, kind, company, status, notes,
	created_by, updated_by, created_at, updated_at`

const contactColumns = `id, client_id, name, nickname, role, email, phone, is_primary, notes,
	created_by, updated_by, created_at, updated_at,
	birthday, last_contacted_on, reach_every_days`

func scanClient(row interface{ Scan(...any) error }) (Client, error) {
	var c Client
	err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Kind, &c.Company, &c.Status, &c.Notes,
		&c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func scanContact(row interface{ Scan(...any) error }) (Contact, error) {
	var c Contact
	err := row.Scan(&c.ID, &c.ClientID, &c.Name, &c.Nickname, &c.Role, &c.Email, &c.Phone,
		&c.IsPrimary, &c.Notes, &c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt,
		&c.Birthday, &c.LastContactedOn, &c.ReachEveryDays)
	return c, err
}

func (s *Store) uniqueClientSlug(ctx context.Context, name string, excludeID int64) (string, error) {
	base := Slugify(name)
	candidate := base
	for n := 2; ; n++ {
		var taken bool
		err := s.pool.QueryRow(ctx,
			`select exists (select 1 from clients where slug = $1 and id <> $2 and deleted_at is null)`,
			candidate, excludeID).Scan(&taken)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, n)
	}
}

func (s *Store) ListClients(ctx context.Context, f ClientFilter) ([]Client, error) {
	rows, err := s.pool.Query(ctx, `
		select c.id, c.slug, c.name, c.kind, c.company, c.status, c.notes,
		       c.created_by, c.updated_by, c.created_at, c.updated_at,
		       (select count(*) from projects p where p.client_id = c.id and p.deleted_at is null),
		       (select count(*) from contacts ct where ct.client_id = c.id and ct.deleted_at is null)
		from clients c
		where c.deleted_at is null
		  and ($1 = '' or c.status = $1)
		  and ($2 = '' or c.name ilike '%' || $2 || '%'
		                or c.company ilike '%' || $2 || '%')
		order by c.name`, f.Status, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Client{}
	for rows.Next() {
		var c Client
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Kind, &c.Company, &c.Status, &c.Notes,
			&c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt,
			&c.ProjectCount, &c.ContactCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) ClientBySlug(ctx context.Context, slug string) (Client, error) {
	c, err := scanClient(s.pool.QueryRow(ctx,
		`select `+clientColumns+` from clients where slug = $1 and deleted_at is null`, slug))
	if err != nil {
		return c, norm(err)
	}
	if c.Contacts, err = s.ContactsByClient(ctx, c.ID); err != nil {
		return c, err
	}
	if c.Projects, err = s.ListProjects(ctx, ProjectFilter{Client: slug}); err != nil {
		return c, err
	}
	c.ContactCount = len(c.Contacts)
	c.ProjectCount = len(c.Projects)
	return c, nil
}

func (s *Store) CreateClient(ctx context.Context, in ClientInput, actor string) (Client, error) {
	slug, err := s.uniqueClientSlug(ctx, in.Name, 0)
	if err != nil {
		return Client{}, err
	}
	c, err := scanClient(s.pool.QueryRow(ctx, `
		insert into clients (slug, name, kind, company, status, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $7)
		returning `+clientColumns,
		slug, in.Name, in.Kind, in.Company, in.Status, in.Notes, actor))
	return c, norm(err)
}

func (s *Store) UpdateClient(ctx context.Context, slug string, in ClientInput, actor string) (Client, error) {
	current, err := scanClient(s.pool.QueryRow(ctx,
		`select `+clientColumns+` from clients where slug = $1 and deleted_at is null`, slug))
	if err != nil {
		return Client{}, norm(err)
	}

	newSlug := current.Slug
	if !strings.EqualFold(current.Name, in.Name) {
		if newSlug, err = s.uniqueClientSlug(ctx, in.Name, current.ID); err != nil {
			return Client{}, err
		}
	}

	c, err := scanClient(s.pool.QueryRow(ctx, `
		update clients set slug = $1, name = $2, kind = $3, company = $4, status = $5,
		       notes = $6, updated_by = $7, updated_at = now()
		 where id = $8
		returning `+clientColumns,
		newSlug, in.Name, in.Kind, in.Company, in.Status, in.Notes, actor, current.ID))
	return c, norm(err)
}

// DeleteClient leaves the projects standing: the foreign key is ON DELETE SET
// NULL, so they simply lose their client rather than disappearing with it.
func (s *Store) DeleteClient(ctx context.Context, slug, actor string) error {
	return s.softDelete(ctx, "clients", "slug", slug, actor)
}

func (s *Store) RestoreClient(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "clients", id, actor)
}

func (s *Store) ContactsByClient(ctx context.Context, clientID int64) ([]Contact, error) {
	rows, err := s.pool.Query(ctx, `
		select `+contactColumns+` from contacts where client_id = $1 and deleted_at is null
		order by is_primary desc, name`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Contact{}
	for rows.Next() {
		c, err := scanContact(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) CreateContact(ctx context.Context, clientID int64, in ContactInput, actor string) (Contact, error) {
	c, err := scanContact(s.pool.QueryRow(ctx, `
		insert into contacts (client_id, name, role, email, phone, is_primary, notes,
		                      created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
		returning `+contactColumns,
		clientID, in.Name, in.Role, in.Email, in.Phone, in.IsPrimary, in.Notes, actor))
	return c, norm(err)
}

func (s *Store) UpdateContact(ctx context.Context, id int64, in ContactInput, actor string) (Contact, error) {
	c, err := scanContact(s.pool.QueryRow(ctx, `
		update contacts set name = $1, role = $2, email = $3, phone = $4,
		       is_primary = $5, notes = $6, updated_by = $7, updated_at = now()
		 where id = $8 and deleted_at is null
		returning `+contactColumns,
		in.Name, in.Role, in.Email, in.Phone, in.IsPrimary, in.Notes, actor, id))
	return c, norm(err)
}

func (s *Store) DeleteContact(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "contacts", id, actor)
}

func (s *Store) RestoreContact(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "contacts", id, actor)
}

func (s *Store) CountClients(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*) from clients where deleted_at is null`).Scan(&n)
	return n, err
}
