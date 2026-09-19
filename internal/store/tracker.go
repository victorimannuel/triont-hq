package store

import (
	"context"
	"strings"
	"time"
)

// TrackerTask is one row of the personal task tracker — the same columns as the
// NPD spreadsheet it replaces. Area is free text; priority, project, owner,
// status and company are validated against the option lists in the API.
type TrackerTask struct {
	ID        int64     `json:"id"`
	Priority  string    `json:"priority"`
	Project   string    `json:"project"`
	Area      string    `json:"area"`
	Task      string    `json:"task"`
	Owner     string    `json:"owner"`
	Status    string    `json:"status"`
	Company   string    `json:"company"`
	NextStep  string    `json:"next_step"`
	Comment   string    `json:"comment"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type TrackerInput struct {
	Priority string `json:"priority"`
	Project  string `json:"project"`
	Area     string `json:"area"`
	Task     string `json:"task"`
	Owner    string `json:"owner"`
	Status   string `json:"status"`
	Company  string `json:"company"`
	NextStep string `json:"next_step"`
	Comment  string `json:"comment"`
}

type TrackerFilter struct {
	Status  string
	Owner   string
	Project string
	Company string
	Query   string
}

const trackerCols = `id, priority, project, area, task, owner, status, company,
	next_step, comment, created_by, updated_by, created_at, updated_at`

func scanTracker(row interface{ Scan(...any) error }) (TrackerTask, error) {
	var s TrackerTask
	err := row.Scan(&s.ID, &s.Priority, &s.Project, &s.Area, &s.Task, &s.Owner, &s.Status,
		&s.Company, &s.NextStep, &s.Comment, &s.CreatedBy, &s.UpdatedBy,
		&s.CreatedAt, &s.UpdatedAt)
	return s, err
}

// ListTrackerTasks returns the board: open work first and done last, urgent
// before low inside that, and newest first inside that. Every filter is
// optional, so an empty filter is the whole list.
func (st *Store) ListTrackerTasks(ctx context.Context, f TrackerFilter) ([]TrackerTask, error) {
	rows, err := st.pool.Query(ctx, `select `+trackerCols+`
		  from tracker_tasks
		 where deleted_at is null
		   and ($1 = '' or status = $1)
		   and ($2 = '' or owner = $2)
		   and ($4 = '' or project = $4)
		   and ($5 = '' or company = $5)
		   and ($3 = '' or task ilike '%' || $3 || '%' or area ilike '%' || $3 || '%'
		        or next_step ilike '%' || $3 || '%' or comment ilike '%' || $3 || '%')
		 order by (status = 'done'),
		          case priority when 'urgent' then 0 when 'high' then 1
		                        when 'normal' then 2 else 3 end,
		          created_at desc`,
		f.Status, f.Owner, strings.TrimSpace(f.Query), f.Project, f.Company)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TrackerTask{}
	for rows.Next() {
		s, err := scanTracker(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (st *Store) TrackerTaskByID(ctx context.Context, id int64) (TrackerTask, error) {
	s, err := scanTracker(st.pool.QueryRow(ctx,
		`select `+trackerCols+` from tracker_tasks where id = $1 and deleted_at is null`, id))
	return s, norm(err)
}

func (st *Store) CreateTrackerTask(ctx context.Context, in TrackerInput, actor string) (TrackerTask, error) {
	var id int64
	err := st.pool.QueryRow(ctx, `
		insert into tracker_tasks (priority, project, area, task, owner, status, company,
		                           next_step, comment, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
		returning id`,
		in.Priority, in.Project, in.Area, in.Task, in.Owner, in.Status, in.Company,
		in.NextStep, in.Comment, actor).Scan(&id)
	if err != nil {
		return TrackerTask{}, norm(err)
	}
	return st.TrackerTaskByID(ctx, id)
}

func (st *Store) UpdateTrackerTask(ctx context.Context, id int64, in TrackerInput, actor string) (TrackerTask, error) {
	tag, err := st.pool.Exec(ctx, `
		update tracker_tasks set priority = $1, project = $2, area = $3, task = $4, owner = $5,
		       status = $6, company = $7, next_step = $8, comment = $9,
		       updated_by = $10, updated_at = now()
		 where id = $11 and deleted_at is null`,
		in.Priority, in.Project, in.Area, in.Task, in.Owner, in.Status, in.Company,
		in.NextStep, in.Comment, actor, id)
	if err != nil {
		return TrackerTask{}, err
	}
	if tag.RowsAffected() == 0 {
		return TrackerTask{}, ErrNotFound
	}
	return st.TrackerTaskByID(ctx, id)
}

func (st *Store) DeleteTrackerTask(ctx context.Context, id int64, actor string) error {
	return st.softDeleteByID(ctx, "tracker_tasks", id, actor)
}

func (st *Store) RestoreTrackerTask(ctx context.Context, id int64, actor string) error {
	return st.restore(ctx, "tracker_tasks", id, actor)
}
