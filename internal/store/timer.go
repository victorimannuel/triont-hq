package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// The alarm for a countdown that is currently running. It exists so the thing
// can go off with the app closed — the browser holds the clock everyone
// actually watches, and this is only what wakes the phone when nobody is.
type TimerAlarm struct {
	UserID  int64
	FiresAt time.Time
	Label   string
	// plain, work or break. A focus run needs to know which half just ended so
	// the other one can be armed in its place.
	Kind  string
	Round int
}

// SetAlarm replaces whatever was armed. One row per person, so starting a
// second timer is the same operation as moving the first.
func (s *Store) SetAlarm(ctx context.Context, alarm TimerAlarm) error {
	_, err := s.pool.Exec(ctx, `
		insert into timer_alarms (user_id, fires_at, label, kind, round)
		values ($1, $2, $3, $4, $5)
		on conflict (user_id) do update
		   set fires_at = excluded.fires_at,
		       label = excluded.label,
		       kind = excluded.kind,
		       round = excluded.round`,
		alarm.UserID, alarm.FiresAt, alarm.Label, alarm.Kind, alarm.Round)
	return err
}

func (s *Store) ClearAlarm(ctx context.Context, userID int64) error {
	_, err := s.pool.Exec(ctx, `delete from timer_alarms where user_id = $1`, userID)
	return err
}

/*
ClaimDueAlarms takes every alarm whose moment has passed and removes it in the
same statement. Deleting as part of the read is what stops a slow push from
letting the next tick send the same alarm twice.
*/
func (s *Store) ClaimDueAlarms(ctx context.Context, now time.Time) ([]TimerAlarm, error) {
	rows, err := s.pool.Query(ctx, `
		delete from timer_alarms
		 where fires_at <= $1
		returning user_id, fires_at, label, kind, round`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TimerAlarm{}
	for rows.Next() {
		var a TimerAlarm
		if err := rows.Scan(&a.UserID, &a.FiresAt, &a.Label, &a.Kind, &a.Round); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Alarm reports what is armed, or false when nothing is.
func (s *Store) Alarm(ctx context.Context, userID int64) (TimerAlarm, bool, error) {
	var a TimerAlarm
	err := s.pool.QueryRow(ctx, `
		select user_id, fires_at, label, kind, round
		  from timer_alarms where user_id = $1`, userID).
		Scan(&a.UserID, &a.FiresAt, &a.Label, &a.Kind, &a.Round)
	if errors.Is(err, pgx.ErrNoRows) {
		return TimerAlarm{}, false, nil
	}
	return a, err == nil, err
}
