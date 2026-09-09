package store

import (
	"context"
	"strconv"
	"strings"
	"time"
)

/*
One line a day.

Keyed by the date because that is the whole shape of it: there is exactly one
line per day, writing again replaces it, and clearing it leaves no row rather
than a row that says nothing. That last part is what makes "days with
something written" a count rather than a filter.
*/

type JournalDay struct {
	// The date, as YYYY-MM-DD. A string rather than a time, because nothing
	// downstream does arithmetic on it and a timestamp would only invite a
	// timezone to get involved.
	On        string    `json:"on"`
	Line      string    `json:"line"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func scanJournal(row interface{ Scan(...any) error }) (JournalDay, error) {
	var j JournalDay
	var on time.Time
	err := row.Scan(&on, &j.Line, &j.CreatedBy, &j.UpdatedBy, &j.CreatedAt, &j.UpdatedAt)
	j.On = on.Format("2006-01-02")
	return j, err
}

const journalCols = `on_date, line, created_by, updated_by, created_at, updated_at`

// Journal is the recent lines, newest first. Days with nothing written are
// simply absent, so a quiet week is a short list rather than seven blanks.
func (s *Store) Journal(ctx context.Context, days int) ([]JournalDay, error) {
	if days <= 0 || days > 3650 {
		days = 30
	}
	rows, err := s.pool.Query(ctx, `select `+journalCols+`
		  from journal_days
		 where on_date >= current_date - $1::int and deleted_at is null
		 order by on_date desc`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []JournalDay{}
	for rows.Next() {
		entry, err := scanJournal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

// JournalDayOn is one day, or an empty line when nothing was written. Not
// found is not an error here: the check-in asks about today whether or not
// there is anything there yet.
func (s *Store) JournalDayOn(ctx context.Context, day time.Time) (JournalDay, error) {
	entry, err := scanJournal(s.pool.QueryRow(ctx,
		`select `+journalCols+` from journal_days
		  where on_date = $1 and deleted_at is null`, day))
	if err == nil {
		return entry, nil
	}
	if norm(err) == ErrNotFound {
		return JournalDay{On: day.Format("2006-01-02")}, nil
	}
	return entry, err
}

/*
SetJournalLine writes the day's line, replacing whatever was there. Emptying it
takes the day off the list — nothing written and a blank written are the same
fact, and keeping both would mean the page has to tell them apart.

The row is hidden rather than dropped, so a line cleared by accident is in the
bin. Writing that day again brings it back with the new line, which is why the
upsert clears the deletion as well as the text.
*/
func (s *Store) SetJournalLine(ctx context.Context, day time.Time, line, actor string) (JournalDay, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		_, err := s.pool.Exec(ctx, `
			update journal_days set deleted_at = now(), deleted_by = $2
			 where on_date = $1 and deleted_at is null`, day, actor)
		return JournalDay{On: day.Format("2006-01-02")}, err
	}

	entry, err := scanJournal(s.pool.QueryRow(ctx, `
		insert into journal_days (on_date, line, created_by, updated_by)
		values ($1, $2, $3, $3)
		on conflict (on_date) do update
		   set line = excluded.line, updated_by = excluded.updated_by,
		       updated_at = now(), deleted_at = null, deleted_by = ''
		returning `+journalCols, day, line, actor))
	return entry, norm(err)
}

func (s *Store) RestoreJournalDay(ctx context.Context, stamp int64) error {
	day, err := time.Parse("20060102", strconv.FormatInt(stamp, 10))
	if err != nil {
		return ErrNotFound
	}
	return s.restoreBare(ctx, "journal_days", "on_date", day)
}
