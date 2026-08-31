package store

import (
	"context"
	"strings"
	"time"
)

type Tag struct {
	ID        int64     `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`

	UseCount int `json:"use_count"`
}

// EnsureTag looks a tag up by its slug and creates it if it is new, so the UI
// can be a plain "type a word and press enter" box without a separate step for
// managing the tag list.
func (s *Store) EnsureTag(ctx context.Context, name, actor string) (Tag, error) {
	name = strings.TrimSpace(name)
	slug := Slugify(name)

	var t Tag
	err := s.pool.QueryRow(ctx, `
		insert into tags (slug, name, created_by) values ($1, $2, $3)
		on conflict (slug) do update set slug = excluded.slug
		returning id, slug, name, color, created_by, created_at`,
		slug, name, actor,
	).Scan(&t.ID, &t.Slug, &t.Name, &t.Color, &t.CreatedBy, &t.CreatedAt)
	return t, norm(err)
}

func (s *Store) ListTags(ctx context.Context) ([]Tag, error) {
	rows, err := s.pool.Query(ctx, `
		select t.id, t.slug, t.name, t.color, t.created_by, t.created_at,
		       (select count(*) from taggings g where g.tag_id = t.id)
		from tags t
		order by lower(t.name)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Slug, &t.Name, &t.Color, &t.CreatedBy,
			&t.CreatedAt, &t.UseCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) TagsFor(ctx context.Context, entity string, id int64) ([]Tag, error) {
	rows, err := s.pool.Query(ctx, `
		select t.id, t.slug, t.name, t.color, t.created_by, t.created_at
		from taggings g join tags t on t.id = g.tag_id
		where g.entity = $1 and g.entity_id = $2
		order by lower(t.name)`, entity, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Slug, &t.Name, &t.Color,
			&t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// TagsForMany loads tags for a whole list in one query, so rendering a list of
// projects with their chips does not turn into one query per row.
func (s *Store) TagsForMany(ctx context.Context, entity string, ids []int64) (map[int64][]Tag, error) {
	out := map[int64][]Tag{}
	if len(ids) == 0 {
		return out, nil
	}

	rows, err := s.pool.Query(ctx, `
		select g.entity_id, t.id, t.slug, t.name, t.color, t.created_by, t.created_at
		from taggings g join tags t on t.id = g.tag_id
		where g.entity = $1 and g.entity_id = any($2)
		order by lower(t.name)`, entity, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var t Tag
		if err := rows.Scan(&id, &t.ID, &t.Slug, &t.Name, &t.Color,
			&t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		out[id] = append(out[id], t)
	}
	return out, rows.Err()
}

func (s *Store) AttachTag(ctx context.Context, entity string, id, tagID int64) error {
	_, err := s.pool.Exec(ctx, `
		insert into taggings (tag_id, entity, entity_id) values ($1, $2, $3)
		on conflict do nothing`, tagID, entity, id)
	return norm(err)
}

func (s *Store) DetachTag(ctx context.Context, entity string, id, tagID int64) error {
	tag, err := s.pool.Exec(ctx,
		`delete from taggings where tag_id = $1 and entity = $2 and entity_id = $3`,
		tagID, entity, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteTag removes the tag everywhere. Tags are cheap to retype, so this one
// is a real delete rather than a soft one.
func (s *Store) DeleteTag(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `delete from tags where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
