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
	return out, rows.Err()
}

// DueWithin is the same calendar, narrowed to what needs attention now:
// anything overdue, plus everything falling due in the next `days`. It is what
// the daily reminder reads.
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

	// Birthdays repeat every year, so the calendar returns them for a window
	// wider than we want here; the date filter above already handles the rest.
	out := make([]CalendarEntry, 0, len(all))
	for _, entry := range all {
		if entry.Date.Before(from) || entry.Date.After(to) {
			continue
		}
		out = append(out, entry)
	}
	return out, nil
}
