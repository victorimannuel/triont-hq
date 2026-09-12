package store

import (
	"context"
	"time"
)

// CalendarEntry is one dated thing, flattened out of whichever table it came
// from so the calendar page does not have to know about any of them.
type CalendarEntry struct {
	Date   time.Time `json:"date"`
	Kind   string    `json:"kind"`
	Label  string    `json:"label"`
	Detail string    `json:"detail"`
	URL    string    `json:"url"`
	// How many days lived, for a milestone. Zero everywhere else, which has
	// no number to carry.
	Count int `json:"count"`
	// Set once the occurrence has been closed off, and holding whatever was
	// written about it at the time. Empty means either not closed off or
	// closed off without a word, which the Done flag tells apart.
	Done bool   `json:"done"`
	Note string `json:"note"`
}

// Calendar collects every deadline the app knows about between two dates.
// Birthdays are shifted onto the year they next fall in, so a date in 1990
// still shows up on the right day this year.
func (s *Store) Calendar(ctx context.Context, from, to time.Time) ([]CalendarEntry, error) {
	rows, err := s.pool.Query(ctx, `
		select renews_on, 'renewal', name,
		       coalesce(nullif(provider, ''), 'perpanjangan'),
		       '/assets/' || id, 0
		  from assets
		 where deleted_at is null and status = 'active'
		   and renews_on between $1 and $2

		union all
		select expires_on, 'document', name,
		       coalesce(nullif(holder, ''), 'masa berlaku'),
		       '/documents/' || id, 0
		  from documents
		 where deleted_at is null and expires_on between $1 and $2

		union all
		select b.warranty_until, 'warranty', b.name, 'garansi habis',
		       '/belongings/' || b.id, 0
		  from belongings b
		 where b.deleted_at is null and b.warranty_until between $1 and $2

		union all
		select m.next_due, 'maintenance', b.name,
		       coalesce(nullif(m.description, ''), 'perawatan berikutnya'),
		       '/belongings/' || b.id, 0
		  from maintenance_logs m
		  join belongings b on b.id = m.belonging_id and b.deleted_at is null
		 where m.next_due between $1 and $2

		union all
		select b.rent_due_on, 'rent', b.name, 'sewa jatuh tempo', '/belongings/' || b.id, 0
		  from belongings b
		 where b.deleted_at is null and b.ownership <> 'owned'
		   and b.rent_due_on between $1 and $2

		union all
		select i.next_due_on, 'income', i.name, 'pemasukan masuk', '/income/' || i.id, 0
		  from income_streams i
		 where i.deleted_at is null and i.status = 'active'
		   and i.next_due_on between $1 and $2

		union all
		select e.next_due_on, 'expense', e.name, 'pengeluaran jatuh tempo',
		       '/expenses/' || e.id, 0
		  from expense_streams e
		 where e.deleted_at is null and e.status = 'active'
		   and e.next_due_on between $1 and $2

		union all
		-- A to-do with a date on it is a deadline like any other, so it gets
		-- to use the same calendar, the same home page and the same morning
		-- reminder instead of a second set of all three. There is no page per
		-- task, so it links back to the list.
		select due_on, 'todo', title, 'to-do', '/todo', 0
		  from tasks
		 where kind = 'todo' and done_at is null
		   and due_on between $1 and $2

		union all
		select occurrence, 'birthday', name, 'ulang tahun', '/people/' || id, 0
		  from (
		    select c.id, c.name,
		           make_date(y.year, extract(month from c.birthday)::int,
		                     extract(day from c.birthday)::int) as occurrence
		      from contacts c
		      cross join (
		        select generate_series(extract(year from $1::date)::int,
		                               extract(year from $2::date)::int) as year
		      ) y
		     where c.deleted_at is null and c.birthday is not null
		  ) b
		 where occurrence between $1 and $2

		union all
		-- Round numbers of days lived. Nobody works these out by hand, which
		-- is the whole reason they are worth being told about.
		select (c.birthday + m.n)::date, 'milestone', c.name, 'hitungan hari',
		       '/people/' || c.id, m.n
		  from contacts c
		  cross join (values (7777), (10000), (15000), (20000), (25000), (30000)) as m(n)
		 where c.deleted_at is null and c.birthday is not null
		   and (c.birthday + m.n)::date between $1 and $2

		order by 1, 3`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CalendarEntry{}
	for rows.Next() {
		var e CalendarEntry
		if err := rows.Scan(&e.Date, &e.Kind, &e.Label, &e.Detail, &e.URL, &e.Count); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// A date that was closed off says so here, and carries whatever was
	// written about it. The home page drops those; the calendar keeps them,
	// because a year from now "udah telpon" is the part worth having.
	done, err := s.marks(ctx, from, to)
	if err != nil {
		return nil, err
	}
	for at := range out {
		e := &out[at]
		note, closed := done[markKey(e.Kind, e.URL, e.Date.Format("2006-01-02"))]
		e.Done = closed
		e.Note = note
	}
	return out, nil
}

/*
Kinds you tick rather than fix.

Most of this list clears itself. A renewal stops being due when the renewal
date moves, a document when it is replaced, a to-do when it is ticked — the
record changes and the entry follows.

A birthday has nothing to change. The day happens whether or not you did
anything, and next year's is a different occurrence entirely, so there is
nowhere on the contact to write "dealt with". Left alone it would either nag
for a month about something with no action in it, or vanish on its own while
you still meant to call. Both are wrong, so it waits until you say so, and
`calendar_marks` is where that is written down.
*/
var markableKinds = map[string]bool{
	"birthday":  true,
	"milestone": true,
}

// Markable says whether an entry is one that is ticked off by hand. The page
// asks so it knows which rows to put a tick on.
func Markable(kind string) bool { return markableKinds[kind] }

// MarkCalendarEntry records that one occurrence has been dealt with, and what
// was done about it. Marking the same one twice overwrites the note rather than
// failing — the second answer is the one you meant.
func (s *Store) MarkCalendarEntry(ctx context.Context, kind, ref, on, note, actor string) error {
	if !markableKinds[kind] {
		return ErrNotFound
	}
	_, err := s.pool.Exec(ctx, `
		insert into calendar_marks (kind, ref, on_date, note, created_by)
		values ($1, $2, $3::date, $4, $5)
		on conflict (kind, ref, on_date)
		do update set note = excluded.note`, kind, ref, on, note, actor)
	return norm(err)
}

// CalendarMark is one occurrence already closed off, read back on its own.
type CalendarMark struct {
	Kind string `json:"kind"`
	On   string `json:"on"`
	Note string `json:"note"`
}

// CalendarMarksFor is every occurrence closed off against one thing, newest
// first. The person's page reads it: before this year's birthday, what you did
// on the last few is the useful part, and nothing else keeps that.
func (s *Store) CalendarMarksFor(ctx context.Context, ref string) ([]CalendarMark, error) {
	rows, err := s.pool.Query(ctx, `
		select kind, to_char(on_date, 'YYYY-MM-DD'), note from calendar_marks
		 where ref = $1
		 order by on_date desc`, ref)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CalendarMark{}
	for rows.Next() {
		var m CalendarMark
		if err := rows.Scan(&m.Kind, &m.On, &m.Note); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// UnmarkCalendarEntry puts one back, for a tick that was a mis-tap.
func (s *Store) UnmarkCalendarEntry(ctx context.Context, kind, ref, on string) error {
	_, err := s.pool.Exec(ctx, `
		delete from calendar_marks
		 where kind = $1 and ref = $2 and on_date = $3::date`, kind, ref, on)
	return norm(err)
}

// marks reads every occurrence already dealt with in a window, keyed the same
// way an entry identifies itself, with whatever was written about each.
func (s *Store) marks(ctx context.Context, from, to time.Time) (map[string]string, error) {
	rows, err := s.pool.Query(ctx, `
		select kind, ref, to_char(on_date, 'YYYY-MM-DD'), note from calendar_marks
		 where on_date between $1 and $2`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]string{}
	for rows.Next() {
		var kind, ref, on, note string
		if err := rows.Scan(&kind, &ref, &on, &note); err != nil {
			return nil, err
		}
		out[markKey(kind, ref, on)] = note
	}
	return out, rows.Err()
}

// The three things that name one occurrence, joined by something no URL or
// kind can contain.
func markKey(kind, ref, on string) string { return kind + "\x00" + ref + "\x00" + on }

// DueWithin is the same calendar, narrowed to what needs attention now:
// anything overdue, plus everything falling due in the next `days`, minus the
// occurrences already ticked off. It is what the daily reminder reads.
func (s *Store) DueWithin(ctx context.Context, days int) ([]CalendarEntry, error) {
	now := time.Now()
	// A month back so something already missed keeps nagging, rather than
	// disappearing on the day it was due.
	from := now.AddDate(0, 0, -30)
	to := now.AddDate(0, 0, days)

	all, err := s.Calendar(ctx, from, to)
	if err != nil {
		return nil, err
	}
	done, err := s.marks(ctx, from, to)
	if err != nil {
		return nil, err
	}

	// Birthdays repeat every year, so the calendar returns them for a window
	// wider than we want here; the date filter above already handles the rest.
	out := make([]CalendarEntry, 0, len(all))
	for _, entry := range all {
		if entry.Date.Before(from) || entry.Date.After(to) {
			continue
		}
		on := entry.Date.Format("2006-01-02")
		if _, closed := done[markKey(entry.Kind, entry.URL, on)]; closed {
			continue
		}
		out = append(out, entry)
	}
	return out, nil
}
