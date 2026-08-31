package store

import (
	"context"
	"strings"
)

const credentialSelect = `
	select c.id, c.project_id, coalesce(p.name, ''), coalesce(p.slug, ''),
	       c.label, c.kind, c.username, c.host, c.url, c.notes,
	       c.secret_encrypted <> '', c.created_by, c.updated_by, c.created_at, c.updated_at
	from credentials c
	left join projects p on p.id = c.project_id`

func scanCredential(row interface{ Scan(...any) error }) (Credential, error) {
	var c Credential
	err := row.Scan(&c.ID, &c.ProjectID, &c.ProjectName, &c.ProjectSlug,
		&c.Label, &c.Kind, &c.Username, &c.Host, &c.URL, &c.Notes,
		&c.HasSecret, &c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

// ListCredentials filters by project when ProjectID is non-nil. Ciphertext is
// deliberately left out of the projection.
func (s *Store) ListCredentials(ctx context.Context, f CredentialFilter) ([]Credential, error) {
	rows, err := s.pool.Query(ctx, credentialSelect+`
		where c.deleted_at is null
		  and ($1::bigint is null or c.project_id = $1)
		  and ($2 = '' or c.kind = $2)
		  and ($3 = '' or c.label ilike '%' || $3 || '%'
		                or c.username ilike '%' || $3 || '%'
		                or c.host ilike '%' || $3 || '%'
		                or c.url ilike '%' || $3 || '%'
		                or c.notes ilike '%' || $3 || '%')
		order by lower(c.label)`, f.ProjectID, f.Kind, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Credential{}
	for rows.Next() {
		c, err := scanCredential(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) CredentialByID(ctx context.Context, id int64) (Credential, error) {
	c, err := scanCredential(s.pool.QueryRow(ctx, credentialSelect+` where c.id = $1 and c.deleted_at is null`, id))
	return c, norm(err)
}

// CipherByID returns the stored ciphertext for the reveal endpoint only.
func (s *Store) CipherByID(ctx context.Context, id int64) (string, error) {
	var cipher string
	err := s.pool.QueryRow(ctx,
		`select secret_encrypted from credentials where id = $1 and deleted_at is null`, id).Scan(&cipher)
	return cipher, norm(err)
}

func (s *Store) CreateCredential(ctx context.Context, in CredentialInput, cipher, actor string) (Credential, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		insert into credentials (project_id, label, kind, username, host, url, notes,
		                         secret_encrypted, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning id`,
		in.ProjectID, in.Label, in.Kind, in.Username, in.Host, in.URL, in.Notes, cipher, actor,
	).Scan(&id)
	if err != nil {
		return Credential{}, norm(err)
	}
	return s.CredentialByID(ctx, id)
}

// UpdateCredential leaves the stored secret untouched when cipher is nil, so an
// edit that does not retype the password cannot wipe it.
func (s *Store) UpdateCredential(ctx context.Context, id int64, in CredentialInput, cipher *string, actor string) (Credential, error) {
	tag, err := s.pool.Exec(ctx, `
		update credentials set project_id = $1, label = $2, kind = $3, username = $4,
		       host = $5, url = $6, notes = $7,
		       secret_encrypted = coalesce($8, secret_encrypted),
		       updated_by = $9, updated_at = now()
		where id = $10`,
		in.ProjectID, in.Label, in.Kind, in.Username, in.Host, in.URL, in.Notes, cipher, actor, id)
	if err != nil {
		return Credential{}, err
	}
	if tag.RowsAffected() == 0 {
		return Credential{}, ErrNotFound
	}
	return s.CredentialByID(ctx, id)
}

func (s *Store) DeleteCredential(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "credentials", id, actor)
}

func (s *Store) RestoreCredential(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "credentials", id, actor)
}
