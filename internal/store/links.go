package store

import "context"

const linkColumns = `id, project_id, label, url, category, notes,
	created_by, updated_by, created_at, updated_at`

func scanLink(row interface{ Scan(...any) error }) (Link, error) {
	var l Link
	err := row.Scan(&l.ID, &l.ProjectID, &l.Label, &l.URL, &l.Category, &l.Notes,
		&l.CreatedBy, &l.UpdatedBy, &l.CreatedAt, &l.UpdatedAt)
	return l, err
}

func (s *Store) LinksByProject(ctx context.Context, projectID int64) ([]Link, error) {
	rows, err := s.pool.Query(ctx, `
		select `+linkColumns+`
		from project_links where project_id = $1
		order by category, label`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Link{}
	for rows.Next() {
		l, err := scanLink(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) CreateLink(ctx context.Context, projectID int64, in LinkInput, actor string) (Link, error) {
	label := in.Label
	if label == "" {
		label = in.URL
	}
	l, err := scanLink(s.pool.QueryRow(ctx, `
		insert into project_links (project_id, label, url, category, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $6)
		returning `+linkColumns,
		projectID, label, in.URL, in.Category, in.Notes, actor))
	return l, norm(err)
}

func (s *Store) UpdateLink(ctx context.Context, id int64, in LinkInput, actor string) (Link, error) {
	label := in.Label
	if label == "" {
		label = in.URL
	}
	l, err := scanLink(s.pool.QueryRow(ctx, `
		update project_links
		   set label = $1, url = $2, category = $3, notes = $4,
		       updated_by = $5, updated_at = now()
		 where id = $6
		returning `+linkColumns,
		label, in.URL, in.Category, in.Notes, actor, id))
	return l, norm(err)
}

func (s *Store) DeleteLink(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `delete from project_links where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
