package store

import (
	"context"
	"time"
)

// Attachments are stored in the database rather than on disk so the nightly
// pg_dump covers them without a second backup path — and a scan of an identity
// card is exactly the thing that must not be the one file nobody backed up.
// The bytes are encrypted with the same key as credential secrets: the scan of
// a document is more sensitive than the number printed on it.

// Attachment is a file belonging to some record. Entity works like taggings:
// one table for every module rather than one per module.
type Attachment struct {
	ID       int64  `json:"id"`
	Entity   string `json:"entity"`
	EntityID int64  `json:"entity_id"`
	Name     string `json:"name"`
	MimeType string `json:"mime_type"`
	// Size of the original file, not of the ciphertext.
	Size      int64     `json:"size"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// Which records may carry files. An allowlist rather than a free-form string,
// so a typo cannot orphan an upload against an entity nothing reads.
var fileEntities = map[string]string{
	"document":  "documents",
	"belonging": "belongings",
	"project":   "projects",
	"supply":    "supplies",
	"person":    "contacts",
	"asset":     "assets",
	"habit":     "habits",
}

func FileEntityOK(entity string) bool {
	_, ok := fileEntities[entity]
	return ok
}

const attachmentCols = `id, entity, entity_id, name, mime_type, size, notes,
	created_by, created_at`

func scanAttachment(row interface{ Scan(...any) error }) (Attachment, error) {
	var a Attachment
	err := row.Scan(&a.ID, &a.Entity, &a.EntityID, &a.Name, &a.MimeType,
		&a.Size, &a.Notes, &a.CreatedBy, &a.CreatedAt)
	return a, err
}

func (s *Store) Attachments(ctx context.Context, entity string, entityID int64) ([]Attachment, error) {
	rows, err := s.pool.Query(ctx, `select `+attachmentCols+`
		  from attachments
		 where entity = $1 and entity_id = $2 and deleted_at is null
		 order by position, created_at, id`, entity, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Attachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AddAttachment takes bytes already encrypted by the caller: the store never
// sees the key, which keeps every use of it in one package.
func (s *Store) AddAttachment(ctx context.Context, a Attachment, sealed []byte) (Attachment, error) {
	saved, err := scanAttachment(s.pool.QueryRow(ctx, `
		insert into attachments (entity, entity_id, name, mime_type, size,
		                         notes, content, created_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
		returning `+attachmentCols,
		a.Entity, a.EntityID, a.Name, a.MimeType, a.Size, a.Notes,
		sealed, a.CreatedBy))
	return saved, norm(err)
}

// AttachmentContent returns the metadata and the still-encrypted bytes.
func (s *Store) AttachmentContent(ctx context.Context, id int64) (Attachment, []byte, error) {
	var a Attachment
	var sealed []byte
	err := s.pool.QueryRow(ctx, `select `+attachmentCols+`, content
		  from attachments where id = $1 and deleted_at is null`, id).Scan(
		&a.ID, &a.Entity, &a.EntityID, &a.Name, &a.MimeType, &a.Size,
		&a.Notes, &a.CreatedBy, &a.CreatedAt, &sealed)
	if err != nil {
		return a, nil, norm(err)
	}
	return a, sealed, nil
}

/*
ReorderAttachments writes the order the files were dragged into.

Only rows that belong to the record are touched, so an id from somewhere else
in the list cannot quietly move a file that is not on this page. Anything left
out keeps the position it had, which puts it after everything renumbered here.
*/
func (s *Store) ReorderAttachments(ctx context.Context, entity string, entityID int64, ids []int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for at, id := range ids {
		if _, err := tx.Exec(ctx, `
			update attachments set position = $1
			 where id = $2 and entity = $3 and entity_id = $4 and deleted_at is null`,
			at, id, entity, entityID); err != nil {
			return norm(err)
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) DeleteAttachment(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "attachments", id, actor)
}

// AttachmentCounts says how many files each record of one kind carries, so a
// list can show a paperclip without fetching every attachment on the page.
func (s *Store) AttachmentCounts(ctx context.Context, entity string) (map[int64]int, error) {
	rows, err := s.pool.Query(ctx,
		`select entity_id, count(*) from attachments
		  where entity = $1 and deleted_at is null
		 group by entity_id`,
		entity)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int64]int{}
	for rows.Next() {
		var id int64
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}

// AttachmentCovers is the first picture attached to each record of one kind,
// which is what a gallery puts on the front of a card. One statement for the
// whole page: a request per card would be a request per card.
//
// Only images. A PDF has a first page worth looking at too, but rendering one
// is a different job and nothing here can do it yet.
func (s *Store) AttachmentCovers(ctx context.Context, entity string) (map[int64]int64, error) {
	rows, err := s.pool.Query(ctx, `
		select distinct on (entity_id) entity_id, id
		  from attachments
		 where entity = $1 and deleted_at is null
		   and mime_type like 'image/%'
		 order by entity_id, position, created_at, id`, entity)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int64]int64{}
	for rows.Next() {
		var entityID, id int64
		if err := rows.Scan(&entityID, &id); err != nil {
			return nil, err
		}
		out[entityID] = id
	}
	return out, rows.Err()
}

// StorageUsed is what the attachments add to every nightly dump. Worth being
// able to see before it is worth worrying about.
func (s *Store) StorageUsed(ctx context.Context) (int64, int, error) {
	var bytes int64
	var count int
	err := s.pool.QueryRow(ctx,
		`select coalesce(sum(size), 0), count(*) from attachments
		  where deleted_at is null`).Scan(&bytes, &count)
	return bytes, count, err
}

func (s *Store) RestoreAttachment(ctx context.Context, id int64) error {
	return s.restoreBare(ctx, "attachments", "id", id)
}
