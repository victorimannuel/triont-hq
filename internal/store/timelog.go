package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

/*
Hours at work.

Two moments, where they went, and a note. Everything a tracker usually adds on
top of that — rates, invoices, approvals, rounding to the nearest six minutes —
is somebody else's problem; what is wanted here is only how the day actually
went.

The clock that is running is not a separate thing. It is a row whose end has
not been written yet, which means starting one is an insert, stopping one is an
update, and an hour you forgot to clock is the same row typed in by hand. There
is no second code path for the honest version of the log.

Several clocks may run at once, because work happens that way: an RR call while
an NPD build runs is two projects and one hour. So a day's total is the sum of
what was worked on, which is not the same as how long the chair was warm, and
is deliberately the more useful of the two.
*/

// TimeEntry is one stretch of work.
type TimeEntry struct {
	ID int64 `json:"id"`
	// Null for work that belonged to no project.
	ProjectID *int64 `json:"project_id"`
	// The project's name, carried along so a list does not have to be joined
	// again in the browser. Empty when there is no project.
	Project string `json:"project"`
	/*
		Which part of the project — AFS, NPD, RR. Free text rather than a table:
		the only thing there is to know about a part is its name, the list is
		open-ended, and one starts existing the moment it is typed. What keeps
		it tidy is the picker offering back what has been used before.
	*/
	Part      string     `json:"part"`
	Note      string     `json:"note"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at"`
	// How long it ran. A running entry counts up to now, so the number is
	// always the answer to "how long has this been going".
	Seconds   int64     `json:"seconds"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type TimeEntryInput struct {
	ProjectID *int64 `json:"project_id"`
	Part      string `json:"part"`
	Note      string `json:"note"`
	// RFC3339, both of them. An empty start means now, which is what pressing
	// start means. An empty end means it is still running.
	StartedAt string `json:"started_at"`
	EndedAt   string `json:"ended_at"`
}

const timeCols = `e.id, e.project_id, coalesce(p.name, ''), e.part, e.note,
	e.started_at, e.ended_at, e.created_by, e.updated_by, e.created_at, e.updated_at`

const timeFrom = ` from time_entries e left join projects p on p.id = e.project_id`

func scanTimeEntry(row interface{ Scan(...any) error }) (TimeEntry, error) {
	var e TimeEntry
	err := row.Scan(&e.ID, &e.ProjectID, &e.Project, &e.Part, &e.Note, &e.StartedAt,
		&e.EndedAt, &e.CreatedBy, &e.UpdatedBy, &e.CreatedAt, &e.UpdatedAt)
	e.Seconds = e.elapsed()
	return e, err
}

// elapsed is how long the entry covers, counting up to now while it runs.
// Never negative: a start typed later than its end is a typo, not a negative
// day, and a total that goes down because of one is harder to spot.
func (e TimeEntry) elapsed() int64 {
	end := time.Now()
	if e.EndedAt != nil {
		end = *e.EndedAt
	}
	if secs := int64(end.Sub(e.StartedAt).Seconds()); secs > 0 {
		return secs
	}
	return 0
}

/*
EntriesOn is one day's work, newest first.

The day is the caller's, not the server's, for the same reason a meal's is:
work that ran past midnight belongs to the evening it was part of, and only the
browser knows which day that felt like.
*/
func (s *Store) EntriesOn(ctx context.Context, day time.Time) ([]TimeEntry, error) {
	from := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	rows, err := s.pool.Query(ctx, `select `+timeCols+timeFrom+`
		 where e.deleted_at is null and e.started_at >= $1 and e.started_at < $2
		 order by e.started_at desc, e.id desc`, from, from.AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TimeEntry{}
	for rows.Next() {
		entry, err := scanTimeEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

func (s *Store) TimeEntryByID(ctx context.Context, id int64) (TimeEntry, error) {
	entry, err := scanTimeEntry(s.pool.QueryRow(ctx, `select `+timeCols+timeFrom+`
		 where e.id = $1 and e.deleted_at is null`, id))
	return entry, norm(err)
}

// RunningEntries is every clock still going, newest first. Usually none or
// one; more than one is the whole point of the change that allowed it.
func (s *Store) RunningEntries(ctx context.Context) ([]TimeEntry, error) {
	rows, err := s.pool.Query(ctx, `select `+timeCols+timeFrom+`
		 where e.ended_at is null and e.deleted_at is null
		 order by e.started_at desc, e.id desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TimeEntry{}
	for rows.Next() {
		entry, err := scanTimeEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

/*
StartEntry puts another clock on.

It leaves whatever else is running alone. Starting one used to stop the others,
on the reasoning that an hour cannot be spent twice — but it can be worked
twice, and a tracker that quietly closes the thing you are still doing is
worse than one that lets you run two.
*/
func (s *Store) StartEntry(ctx context.Context, in TimeEntryInput, actor string) (TimeEntry, error) {
	at, err := parseMoment(in.StartedAt)
	if err != nil {
		return TimeEntry{}, err
	}

	var id int64
	if err := s.pool.QueryRow(ctx, `
		insert into time_entries (project_id, part, note, started_at, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $5) returning id`,
		in.ProjectID, strings.TrimSpace(in.Part), strings.TrimSpace(in.Note),
		at, actor).Scan(&id); err != nil {
		return TimeEntry{}, err
	}
	return s.TimeEntryByID(ctx, id)
}

// StopEntry puts one clock down. ErrNotFound when that one was not running, so
// a second tap says so rather than pretending to have worked.
func (s *Store) StopEntry(ctx context.Context, id int64, at time.Time, actor string) (TimeEntry, error) {
	tag, err := s.pool.Exec(ctx, `
		update time_entries set ended_at = $1, updated_by = $2, updated_at = now()
		 where id = $3 and ended_at is null and deleted_at is null`, at, actor, id)
	if err != nil {
		return TimeEntry{}, err
	}
	if tag.RowsAffected() == 0 {
		return TimeEntry{}, ErrNotFound
	}
	return s.TimeEntryByID(ctx, id)
}

// CreateEntry writes an hour down after the fact. Both ends are given, because
// an entry with no end would be a second running clock.
func (s *Store) CreateEntry(ctx context.Context, in TimeEntryInput, actor string) (TimeEntry, error) {
	started, ended, err := parseSpan(in)
	if err != nil {
		return TimeEntry{}, err
	}
	var id int64
	if err := s.pool.QueryRow(ctx, `
		insert into time_entries (project_id, part, note, started_at, ended_at, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $6) returning id`,
		in.ProjectID, strings.TrimSpace(in.Part), strings.TrimSpace(in.Note),
		started, ended, actor).Scan(&id); err != nil {
		return TimeEntry{}, err
	}
	return s.TimeEntryByID(ctx, id)
}

// UpdateEntry corrects one. Clearing the end puts the clock back on, which is
// how a stop pressed by accident gets undone.
func (s *Store) UpdateEntry(ctx context.Context, id int64, in TimeEntryInput, actor string) (TimeEntry, error) {
	started, ended, err := parseSpan(in)
	if err != nil {
		return TimeEntry{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update time_entries set project_id = $1, part = $2, note = $3, started_at = $4,
		       ended_at = $5, updated_by = $6, updated_at = now()
		 where id = $7 and deleted_at is null`,
		in.ProjectID, strings.TrimSpace(in.Part), strings.TrimSpace(in.Note),
		started, ended, actor, id)
	if err != nil {
		return TimeEntry{}, err
	}
	if tag.RowsAffected() == 0 {
		return TimeEntry{}, ErrNotFound
	}
	return s.TimeEntryByID(ctx, id)
}

func (s *Store) DeleteTimeEntry(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "time_entries", id, actor)
}

func (s *Store) RestoreTimeEntry(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "time_entries", id, actor)
}

// parseSpan reads both ends of a hand-written entry. An empty end is allowed
// and means the clock is still running, which is what clearing it is for.
func parseSpan(in TimeEntryInput) (time.Time, *time.Time, error) {
	started, err := parseMoment(in.StartedAt)
	if err != nil {
		return time.Time{}, nil, err
	}
	if strings.TrimSpace(in.EndedAt) == "" {
		return started, nil, nil
	}
	ended, err := time.Parse(time.RFC3339, strings.TrimSpace(in.EndedAt))
	if err != nil {
		return time.Time{}, nil, err
	}
	return started, &ended, nil
}

// midnight is the start of the day a moment falls in, in its own zone. Every
// window here is counted in whole days of the caller's calendar, not in
// twenty-four hour blocks from whenever the request happened to arrive.
func midnight(at time.Time) time.Time {
	return time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, at.Location())
}

// DayWork is one day's total, for the strip that shows a week or a month.
type DayWork struct {
	On      string `json:"on"`
	Seconds int64  `json:"seconds"`
	Entries int    `json:"entries"`
}

/*
DayWork is every day from first to last inclusive, oldest first, with the empty
ones kept as zeroes.

The blanks are the point. A week with three gaps is either three days off or
three days the log was not kept, and both of those are worth seeing; a chart
that closed the gaps would show neither.
*/
func (s *Store) DayWork(ctx context.Context, first, last time.Time) ([]DayWork, error) {
	first, last = midnight(first), midnight(last)

	entries, err := s.entriesBetween(ctx, first, last.AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}

	totals := map[string]*DayWork{}
	for _, entry := range entries {
		key := entry.StartedAt.In(last.Location()).Format("2006-01-02")
		if totals[key] == nil {
			totals[key] = &DayWork{On: key}
		}
		totals[key].Seconds += entry.Seconds
		totals[key].Entries++
	}

	out := []DayWork{}
	for d := first; !d.After(last); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if got := totals[key]; got != nil {
			out = append(out, *got)
			continue
		}
		out = append(out, DayWork{On: key})
	}
	return out, nil
}

// ProjectWork is what one part of one project took over a window.
type ProjectWork struct {
	ProjectID *int64 `json:"project_id"`
	Project   string `json:"project"`
	Part      string `json:"part"`
	Seconds   int64  `json:"seconds"`
	Entries   int    `json:"entries"`
}

/*
ProjectTotals is where the window's hours went, biggest first.

Split by part as well as by project, because "8 hours on MHK" answers nothing
that needs answering and "5 on NPD, 3 on RR" answers all of it.

Work with no project is one row of its own rather than dropped. Hours that
belong to nothing are still hours, and hiding them makes the totals disagree
with the day above them, which reads as a bug in the arithmetic.
*/
func (s *Store) ProjectTotals(ctx context.Context, first, last time.Time) ([]ProjectWork, error) {
	entries, err := s.entriesBetween(ctx, midnight(first), midnight(last).AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}

	// Keyed by project and part together, with zero standing for no project.
	// Parts are matched without case, so "npd" typed in a hurry lands on the
	// same row as "NPD" rather than quietly starting a second one.
	at := map[string]int{}
	out := []ProjectWork{}
	for _, entry := range entries {
		var id int64
		if entry.ProjectID != nil {
			id = *entry.ProjectID
		}
		key := fmt.Sprintf("%d|%s", id, strings.ToLower(entry.Part))

		i, ok := at[key]
		if !ok {
			out = append(out, ProjectWork{ProjectID: entry.ProjectID, Project: entry.Project})
			i = len(out) - 1
			at[key] = i
		}
		// Oldest first below, so the last spelling seen is the most recent
		// one — the same one the picker offers back, so the summary and the
		// box underneath it never disagree about whether it is NPD or npd.
		out[i].Part = entry.Part
		out[i].Seconds += entry.Seconds
		out[i].Entries++
	}

	// Biggest first, so the week's answer is the first line.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].Seconds > out[j-1].Seconds; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out, nil
}

/*
KnownParts is every part used on each project, for the picker to offer back.

This is what keeps free text from turning into a mess: the parts of a project
are whatever has been typed on it before, so the second entry on NPD is picked
from a list rather than spelled again. Matched without case, and the spelling
offered is the most recent one.
*/
func (s *Store) KnownParts(ctx context.Context) ([]ProjectPart, error) {
	rows, err := s.pool.Query(ctx, `
		select distinct on (e.project_id, lower(e.part)) e.project_id, e.part
		  from time_entries e
		 where e.deleted_at is null and e.part <> ''
		 order by e.project_id, lower(e.part), e.started_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProjectPart{}
	for rows.Next() {
		var part ProjectPart
		if err := rows.Scan(&part.ProjectID, &part.Name); err != nil {
			return nil, err
		}
		out = append(out, part)
	}
	return out, rows.Err()
}

// ProjectPart is one name the picker offers under one project.
type ProjectPart struct {
	ProjectID *int64 `json:"project_id"`
	Name      string `json:"name"`
}

// entriesBetween is the window both summaries above read. They add up the same
// rows two different ways, and doing it in Go rather than twice in SQL keeps
// the running clock's "up to now" in one place.
//
// Oldest first, which is what lets the summary above take the latest spelling
// of a part simply by letting each row overwrite the one before it.
func (s *Store) entriesBetween(ctx context.Context, from, to time.Time) ([]TimeEntry, error) {
	rows, err := s.pool.Query(ctx, `select `+timeCols+timeFrom+`
		 where e.deleted_at is null and e.started_at >= $1 and e.started_at < $2
		 order by e.started_at, e.id`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TimeEntry{}
	for rows.Next() {
		entry, err := scanTimeEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}
