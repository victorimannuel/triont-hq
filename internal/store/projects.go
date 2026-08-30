package store

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// Every project read goes through this projection so the client name is
// resolved in one place. projects.client_id is the truth; the text column it
// replaced is left alone for the backfill in schema.sql.
const projectCols = `p.id, p.slug, p.name, p.client_id, coalesce(c.name, ''), coalesce(c.slug, ''),
	p.status, p.kind, p.summary, p.local_path, p.deploy_target, p.notes,
	p.created_by, p.updated_by, p.created_at, p.updated_at`

const projectFrom = ` from projects p left join clients c on c.id = p.client_id and c.deleted_at is null`

const projectSelect = `select ` + projectCols + projectFrom

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func Slugify(v string) string {
	s := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(v), "-"), "-")
	if s == "" {
		return "project"
	}
	return s
}

func scanProject(row interface{ Scan(...any) error }) (Project, error) {
	var p Project
	err := row.Scan(&p.ID, &p.Slug, &p.Name, &p.ClientID, &p.Client, &p.ClientSlug,
		&p.Status, &p.Kind, &p.Summary, &p.LocalPath, &p.DeployTarget, &p.Notes,
		&p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (s *Store) uniqueSlug(ctx context.Context, name string, excludeID int64) (string, error) {
	base := Slugify(name)
	candidate := base
	for n := 2; ; n++ {
		var taken bool
		err := s.pool.QueryRow(ctx,
			`select exists (select 1 from projects where slug = $1 and id <> $2 and deleted_at is null)`,
			candidate, excludeID,
		).Scan(&taken)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, n)
	}
}

func (s *Store) ListProjects(ctx context.Context, f ProjectFilter) ([]Project, error) {
	// Status drives the default order so live work sits at the top.
	rows, err := s.pool.Query(ctx, `select `+projectCols+`
		, (select count(*) from project_links l where l.project_id = p.id)
		, (select count(*) from credentials cr where cr.project_id = p.id)`+
		projectFrom+`
		where p.deleted_at is null
		  and ($1 = '' or p.status = $1)
		  and ($2 = '' or p.kind = $2)
		  and ($3 = '' or c.slug = $3)
		  and ($5 = '' or exists (
		        select 1 from taggings g join tags t on t.id = g.tag_id
		         where g.entity = 'project' and g.entity_id = p.id and t.slug = $5))
		  and ($4 = '' or p.name ilike '%' || $4 || '%'
		                or c.name ilike '%' || $4 || '%'
		                or p.summary ilike '%' || $4 || '%'
		                or p.local_path ilike '%' || $4 || '%'
		                or p.deploy_target ilike '%' || $4 || '%')
		order by case p.status
		           when 'active' then 0 when 'paused' then 1
		           when 'done' then 2 else 3 end,
		         p.name`,
		f.Status, f.Kind, f.Client, strings.TrimSpace(f.Query), f.Tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Slug, &p.Name, &p.ClientID, &p.Client, &p.ClientSlug,
			&p.Status, &p.Kind, &p.Summary, &p.LocalPath, &p.DeployTarget, &p.Notes,
			&p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt,
			&p.LinkCount, &p.CredentialCount); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ids := make([]int64, len(out))
	for i, p := range out {
		ids[i] = p.ID
	}
	byProject, err := s.TagsForMany(ctx, "project", ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Tags = byProject[out[i].ID]
	}
	return out, nil
}

func (s *Store) projectByID(ctx context.Context, id int64) (Project, error) {
	p, err := scanProject(s.pool.QueryRow(ctx, projectSelect+` where p.id = $1 and p.deleted_at is null`, id))
	return p, norm(err)
}

func (s *Store) ProjectBySlug(ctx context.Context, slug string) (Project, error) {
	p, err := scanProject(s.pool.QueryRow(ctx, projectSelect+` where p.slug = $1 and p.deleted_at is null`, slug))
	if err != nil {
		return p, norm(err)
	}

	if p.Links, err = s.LinksByProject(ctx, p.ID); err != nil {
		return p, err
	}
	if p.Credentials, err = s.ListCredentials(ctx, &p.ID, ""); err != nil {
		return p, err
	}
	if p.Assets, err = s.AssetsForProject(ctx, p.ID); err != nil {
		return p, err
	}
	if p.Tags, err = s.TagsFor(ctx, "project", p.ID); err != nil {
		return p, err
	}
	if p.Income, err = s.IncomeForProject(ctx, p.ID); err != nil {
		return p, err
	}
	p.LinkCount = len(p.Links)
	p.CredentialCount = len(p.Credentials)
	return p, nil
}

func (s *Store) CreateProject(ctx context.Context, in ProjectInput, actor string) (Project, error) {
	slug, err := s.uniqueSlug(ctx, in.Name, 0)
	if err != nil {
		return Project{}, err
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		insert into projects (slug, name, client_id, status, kind, summary, local_path,
		                      deploy_target, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
		returning id`,
		slug, in.Name, in.ClientID, in.Status, in.Kind, in.Summary,
		in.LocalPath, in.DeployTarget, in.Notes, actor).Scan(&id)
	if err != nil {
		return Project{}, norm(err)
	}
	return s.projectByID(ctx, id)
}

func (s *Store) UpdateProject(ctx context.Context, slug string, in ProjectInput, actor string) (Project, error) {
	current, err := scanProject(s.pool.QueryRow(ctx, projectSelect+` where p.slug = $1 and p.deleted_at is null`, slug))
	if err != nil {
		return Project{}, norm(err)
	}

	newSlug := current.Slug
	if !strings.EqualFold(current.Name, in.Name) {
		if newSlug, err = s.uniqueSlug(ctx, in.Name, current.ID); err != nil {
			return Project{}, err
		}
	}

	_, err = s.pool.Exec(ctx, `
		update projects set slug = $1, name = $2, client_id = $3, status = $4, kind = $5,
		       summary = $6, local_path = $7, deploy_target = $8, notes = $9,
		       updated_by = $10, updated_at = now()
		 where id = $11`,
		newSlug, in.Name, in.ClientID, in.Status, in.Kind, in.Summary,
		in.LocalPath, in.DeployTarget, in.Notes, actor, current.ID)
	if err != nil {
		return Project{}, norm(err)
	}
	return s.projectByID(ctx, current.ID)
}

// DeleteProject is a soft delete: the row stays, stamped with who removed it
// and when, and every read filters it out. Restore puts it straight back.
func (s *Store) DeleteProject(ctx context.Context, slug, actor string) error {
	return s.softDelete(ctx, "projects", "slug", slug, actor)
}

func (s *Store) RestoreProject(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "projects", id, actor)
}

func (s *Store) StatusCounts(ctx context.Context) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, `select status, count(*) from projects where deleted_at is null group by status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]int{}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		out[status] = n
	}
	return out, rows.Err()
}
