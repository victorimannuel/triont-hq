package store

import (
	"context"
	"strings"
	"time"
)

// Document is a personal paper with an expiry: KTP, passport, driving licence,
// vehicle registration, an insurance policy. The number itself never leaves the
// database in the clear.
type Document struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	Kind      string     `json:"kind"`
	Holder    string     `json:"holder"`
	Issuer    string     `json:"issuer"`
	IssuedOn  *time.Time `json:"issued_on"`
	ExpiresOn *time.Time `json:"expires_on"`
	Location  string     `json:"location"`
	Notes     string     `json:"notes"`
	HasNumber bool       `json:"has_number"`
	CreatedBy string     `json:"created_by"`
	UpdatedBy string     `json:"updated_by"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`

	Tags []Tag `json:"tags"`
}

type DocumentInput struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Holder    string `json:"holder"`
	Issuer    string `json:"issuer"`
	IssuedOn  string `json:"issued_on"`
	ExpiresOn string `json:"expires_on"`
	Location  string `json:"location"`
	Notes     string `json:"notes"`
	Number    string `json:"number"`
}

type DocumentFilter struct {
	Kind   string
	Holder string
	Query  string
}

const documentCols = `id, name, kind, holder, issuer, issued_on, expires_on,
	location, notes, number_encrypted <> '', created_by, updated_by, created_at, updated_at`

func scanDocument(row interface{ Scan(...any) error }) (Document, error) {
	var d Document
	err := row.Scan(&d.ID, &d.Name, &d.Kind, &d.Holder, &d.Issuer, &d.IssuedOn,
		&d.ExpiresOn, &d.Location, &d.Notes, &d.HasNumber,
		&d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (s *Store) ListDocuments(ctx context.Context, f DocumentFilter) ([]Document, error) {
	rows, err := s.pool.Query(ctx, `select `+documentCols+`
		from documents
		where deleted_at is null
		  and ($1 = '' or kind = $1)
		  and ($2 = '' or holder = $2)
		  and ($3 = '' or name ilike '%' || $3 || '%'
		                or holder ilike '%' || $3 || '%'
		                or issuer ilike '%' || $3 || '%'
		                or location ilike '%' || $3 || '%')
		-- Sorted by name so a thing is always where you last saw it. Status
		-- and dates are filters and badges; they do not get to move the rows
		-- around underneath you.
		order by lower(name)`,
		f.Kind, f.Holder, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Document{}
	for rows.Next() {
		d, err := scanDocument(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ids := make([]int64, len(out))
	for i, d := range out {
		ids[i] = d.ID
	}
	byDoc, err := s.TagsForMany(ctx, "document", ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Tags = byDoc[out[i].ID]
	}
	return out, nil
}

func (s *Store) DocumentByID(ctx context.Context, id int64) (Document, error) {
	d, err := scanDocument(s.pool.QueryRow(ctx,
		`select `+documentCols+` from documents where id = $1 and deleted_at is null`, id))
	if err != nil {
		return d, norm(err)
	}
	if d.Tags, err = s.TagsFor(ctx, "document", id); err != nil {
		return d, err
	}
	return d, nil
}

// DocumentCipher returns the stored ciphertext for the reveal endpoint only.
func (s *Store) DocumentCipher(ctx context.Context, id int64) (string, error) {
	var cipher string
	err := s.pool.QueryRow(ctx,
		`select number_encrypted from documents where id = $1 and deleted_at is null`,
		id).Scan(&cipher)
	return cipher, norm(err)
}

func (s *Store) CreateDocument(ctx context.Context, in DocumentInput, cipher, actor string) (Document, error) {
	issued, err := parseDate(in.IssuedOn)
	if err != nil {
		return Document{}, err
	}
	expires, err := parseDate(in.ExpiresOn)
	if err != nil {
		return Document{}, err
	}
	d, err := scanDocument(s.pool.QueryRow(ctx, `
		insert into documents (name, kind, holder, issuer, issued_on, expires_on,
		                       location, notes, number_encrypted, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
		returning `+documentCols,
		in.Name, in.Kind, in.Holder, in.Issuer, issued, expires,
		in.Location, in.Notes, cipher, actor))
	return d, norm(err)
}

// UpdateDocument leaves the stored number alone when cipher is nil, so an edit
// that does not retype it cannot wipe it.
func (s *Store) UpdateDocument(ctx context.Context, id int64, in DocumentInput, cipher *string, actor string) (Document, error) {
	issued, err := parseDate(in.IssuedOn)
	if err != nil {
		return Document{}, err
	}
	expires, err := parseDate(in.ExpiresOn)
	if err != nil {
		return Document{}, err
	}
	d, err := scanDocument(s.pool.QueryRow(ctx, `
		update documents set name = $1, kind = $2, holder = $3, issuer = $4,
		       issued_on = $5, expires_on = $6, location = $7, notes = $8,
		       number_encrypted = coalesce($9, number_encrypted),
		       updated_by = $10, updated_at = now()
		 where id = $11 and deleted_at is null
		returning `+documentCols,
		in.Name, in.Kind, in.Holder, in.Issuer, issued, expires,
		in.Location, in.Notes, cipher, actor, id))
	return d, norm(err)
}

func (s *Store) DeleteDocument(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "documents", id, actor)
}

func (s *Store) RestoreDocument(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "documents", id, actor)
}

// DocumentsDue mirrors RenewalsDue: expiring soon, plus anything already past.
func (s *Store) DocumentsDue(ctx context.Context, days int) ([]Document, error) {
	rows, err := s.pool.Query(ctx, `select `+documentCols+`
		from documents
		where deleted_at is null
		  and expires_on is not null
		  and expires_on <= current_date + make_interval(days => $1)
		order by expires_on`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Document{}
	for rows.Next() {
		d, err := scanDocument(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) CountDocuments(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`select count(*) from documents where deleted_at is null`).Scan(&n)
	return n, err
}

func (s *Store) DocumentHolders(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`select holder from documents
		  where deleted_at is null and holder <> ''
		  group by holder order by lower(holder)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}
