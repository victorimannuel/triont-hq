package store

import (
	"context"
	"time"
)

// CalendarEvent is a dated thing typed straight onto the calendar — a meeting, a
// reminder — as opposed to a date read off some other record. It is the only
// calendar entry that is created and edited on the calendar itself.
type CalendarEvent struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	OnDate    time.Time `json:"on_date"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CalendarEventInput struct {
	Title  string `json:"title"`
	OnDate string `json:"on_date"`
	Notes  string `json:"notes"`
}

const calendarEventCols = `id, title, on_date, notes,
	created_by, updated_by, created_at, updated_at`

func scanCalendarEvent(row interface{ Scan(...any) error }) (CalendarEvent, error) {
	var e CalendarEvent
	err := row.Scan(&e.ID, &e.Title, &e.OnDate, &e.Notes,
		&e.CreatedBy, &e.UpdatedBy, &e.CreatedAt, &e.UpdatedAt)
	return e, err
}

func (s *Store) CalendarEventByID(ctx context.Context, id int64) (CalendarEvent, error) {
	e, err := scanCalendarEvent(s.pool.QueryRow(ctx,
		`select `+calendarEventCols+` from calendar_events where id = $1 and deleted_at is null`, id))
	return e, norm(err)
}

func (s *Store) CreateCalendarEvent(ctx context.Context, in CalendarEventInput, actor string) (CalendarEvent, error) {
	on, err := parseDate(in.OnDate)
	if err != nil {
		return CalendarEvent{}, err
	}
	e, err := scanCalendarEvent(s.pool.QueryRow(ctx, `
		insert into calendar_events (title, on_date, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $4)
		returning `+calendarEventCols, in.Title, on, in.Notes, actor))
	return e, norm(err)
}

func (s *Store) UpdateCalendarEvent(ctx context.Context, id int64, in CalendarEventInput, actor string) (CalendarEvent, error) {
	on, err := parseDate(in.OnDate)
	if err != nil {
		return CalendarEvent{}, err
	}
	e, err := scanCalendarEvent(s.pool.QueryRow(ctx, `
		update calendar_events set title = $1, on_date = $2, notes = $3,
		       updated_by = $4, updated_at = now()
		 where id = $5 and deleted_at is null
		returning `+calendarEventCols, in.Title, on, in.Notes, actor, id))
	return e, norm(err)
}

func (s *Store) DeleteCalendarEvent(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "calendar_events", id, actor)
}

func (s *Store) RestoreCalendarEvent(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "calendar_events", id, actor)
}
