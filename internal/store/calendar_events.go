package store

import (
	"context"
	"time"
)

// CalendarEvent is a dated thing typed straight onto the calendar — a meeting, a
// reminder — as opposed to a date read off some other record. It is the only
// calendar entry that is created and edited on the calendar itself.
type CalendarEvent struct {
	ID     int64     `json:"id"`
	Title  string    `json:"title"`
	OnDate time.Time `json:"on_date"`
	// Null for a one-day event; otherwise the last day of the block.
	EndOn     *time.Time `json:"end_on"`
	Notes     string     `json:"notes"`
	CreatedBy string     `json:"created_by"`
	UpdatedBy string     `json:"updated_by"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type CalendarEventInput struct {
	Title  string `json:"title"`
	OnDate string `json:"on_date"`
	EndOn  string `json:"end_on"`
	Notes  string `json:"notes"`
}

const calendarEventCols = `id, title, on_date, end_on, notes,
	created_by, updated_by, created_at, updated_at`

func scanCalendarEvent(row interface{ Scan(...any) error }) (CalendarEvent, error) {
	var e CalendarEvent
	err := row.Scan(&e.ID, &e.Title, &e.OnDate, &e.EndOn, &e.Notes,
		&e.CreatedBy, &e.UpdatedBy, &e.CreatedAt, &e.UpdatedAt)
	return e, err
}

func (s *Store) CalendarEventByID(ctx context.Context, id int64) (CalendarEvent, error) {
	e, err := scanCalendarEvent(s.pool.QueryRow(ctx,
		`select `+calendarEventCols+` from calendar_events where id = $1 and deleted_at is null`, id))
	return e, norm(err)
}

func (s *Store) CreateCalendarEvent(ctx context.Context, in CalendarEventInput, actor string) (CalendarEvent, error) {
	on, end, err := eventDates(in)
	if err != nil {
		return CalendarEvent{}, err
	}
	e, err := scanCalendarEvent(s.pool.QueryRow(ctx, `
		insert into calendar_events (title, on_date, end_on, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $5)
		returning `+calendarEventCols, in.Title, on, end, in.Notes, actor))
	return e, norm(err)
}

func (s *Store) UpdateCalendarEvent(ctx context.Context, id int64, in CalendarEventInput, actor string) (CalendarEvent, error) {
	on, end, err := eventDates(in)
	if err != nil {
		return CalendarEvent{}, err
	}
	e, err := scanCalendarEvent(s.pool.QueryRow(ctx, `
		update calendar_events set title = $1, on_date = $2, end_on = $3, notes = $4,
		       updated_by = $5, updated_at = now()
		 where id = $6 and deleted_at is null
		returning `+calendarEventCols, in.Title, on, end, in.Notes, actor, id))
	return e, norm(err)
}

// eventDates parses the start and end. An end on or before the start is treated
// as no end at all — a one-day event — rather than an error, so a stray or equal
// end date never blocks a save.
func eventDates(in CalendarEventInput) (start, end *time.Time, err error) {
	start, err = parseDate(in.OnDate)
	if err != nil {
		return nil, nil, err
	}
	end, err = parseDate(in.EndOn)
	if err != nil {
		return nil, nil, err
	}
	if start != nil && end != nil && !end.After(*start) {
		end = nil
	}
	return start, end, nil
}

func (s *Store) DeleteCalendarEvent(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "calendar_events", id, actor)
}

func (s *Store) RestoreCalendarEvent(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "calendar_events", id, actor)
}
