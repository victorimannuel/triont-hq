package store

import (
	"context"
	"time"
)

/*
A thing to do and a thing to buy are the same row with a different kind on it.
Both get typed in one line, ticked with one tap, and cleared in a batch. What
separates them is where you are standing when you read them, and that is a
question for the pages rather than for the table.
*/

const (
	TaskTodo = "todo"
	TaskBuy  = "buy"
)

type Task struct {
	ID    int64  `json:"id"`
	Kind  string `json:"kind"`
	Title string `json:"title"`
	// Optional on a to-do and absent on a shopping item. A to-do that has one
	// also reaches the calendar, the home page and the morning reminder,
	// which is the only reason the column is here rather than in a note.
	DueOn *time.Time `json:"due_on"`
	// Null until ticked. The moment rather than a flag, because a boolean
	// throws away the one thing that makes a finished list worth keeping.
	DoneAt    *time.Time `json:"done_at"`
	CreatedBy string     `json:"created_by"`
	UpdatedBy string     `json:"updated_by"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type TaskInput struct {
	Title string `json:"title"`
	DueOn string `json:"due_on"`
}

const taskCols = `id, kind, title, due_on, done_at,
	created_by, updated_by, created_at, updated_at`

func scanTask(row interface{ Scan(...any) error }) (Task, error) {
	var t Task
	err := row.Scan(&t.ID, &t.Kind, &t.Title, &t.DueOn, &t.DoneAt,
		&t.CreatedBy, &t.UpdatedBy, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

// Tasks is one list, in the order it gets worked through: still to do first,
// soonest deadline first among those, and a dateless one behind the dated
// ones rather than ahead of them. Ticked lines stay at the bottom until they
// are cleared, so undoing a mis-tap never means typing the line again.
func (s *Store) Tasks(ctx context.Context, kind string) ([]Task, error) {
	rows, err := s.pool.Query(ctx, `select `+taskCols+`
		  from tasks where kind = $1 and deleted_at is null
		 order by done_at is not null, done_at desc,
		          due_on asc nulls last, created_at`, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Task{}
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, task)
	}
	return out, rows.Err()
}

func (s *Store) CreateTask(ctx context.Context, kind string, in TaskInput, actor string) (Task, error) {
	due, err := parseDate(in.DueOn)
	if err != nil {
		return Task{}, err
	}
	task, err := scanTask(s.pool.QueryRow(ctx, `
		insert into tasks (kind, title, due_on, created_by, updated_by)
		values ($1, $2, $3, $4, $4)
		returning `+taskCols, kind, in.Title, due, actor))
	return task, norm(err)
}

func (s *Store) UpdateTask(ctx context.Context, id int64, in TaskInput, actor string) (Task, error) {
	due, err := parseDate(in.DueOn)
	if err != nil {
		return Task{}, err
	}
	task, err := scanTask(s.pool.QueryRow(ctx, `
		update tasks set title = $1, due_on = $2, updated_by = $3, updated_at = now()
		 where id = $4 and deleted_at is null
		returning `+taskCols, in.Title, due, actor, id))
	return task, norm(err)
}

// SetTaskDone ticks or unticks. Both directions matter: a list that cannot be
// unticked punishes a mis-tap by making you type the line out again.
func (s *Store) SetTaskDone(ctx context.Context, id int64, done bool, actor string) (Task, error) {
	task, err := scanTask(s.pool.QueryRow(ctx, `
		update tasks
		   set done_at = case when $2 then now() else null end,
		       updated_by = $3, updated_at = now()
		 where id = $1 and deleted_at is null
		returning `+taskCols, id, done, actor))
	return task, norm(err)
}

// Hidden rather than dropped, like everything else. Clearing the ticked half
// in one go is still a real delete — see ClearDoneTasks.
func (s *Store) DeleteTask(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "tasks", id, actor)
}

// ClearDoneTasks empties the ticked half of one list in a single tap, which is
// what a finished shopping trip needs.
func (s *Store) ClearDoneTasks(ctx context.Context, kind string) (int64, error) {
	tag, err := s.pool.Exec(ctx,
		`delete from tasks where kind = $1 and done_at is not null`, kind)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *Store) RestoreTask(ctx context.Context, id int64) error {
	return s.restoreBare(ctx, "tasks", "id", id)
}
