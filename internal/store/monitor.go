package store

import (
	"context"
	"time"
)

// Monitors report in; HQ never goes looking. A checker knows things HQ has no
// business knowing — an odoo.sh session cookie, a deploy key — and inverting
// that would mean handing those to this app.

// Check is the current state of one thing being watched.
type Check struct {
	ID     int64  `json:"id"`
	Source string `json:"source"`
	// Stable within a source. The reporter picks it; HQ matches on it.
	Key    string `json:"key"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail"`
	URL    string `json:"url"`
	// When this state began, as opposed to when it was last confirmed. A
	// three-day outage should read as three days old, not as one minute.
	SinceAt   time.Time `json:"since_at"`
	CheckedAt time.Time `json:"checked_at"`
}

// Monitor is one reporter and when it last spoke. A monitor that has gone
// quiet is itself a problem, and a silent failure is the one an unattended
// checker is most likely to have.
type Monitor struct {
	Source     string    `json:"source"`
	LastSeenAt time.Time `json:"last_seen_at"`
	// How long it may stay quiet before HQ calls it stale.
	SilentAfter int  `json:"silent_after_minutes"`
	Stale       bool `json:"stale"`
	Problems    int  `json:"problems"`
	Total       int  `json:"total"`
}

type CheckReport struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail"`
	URL    string `json:"url"`
}

const checkCols = `id, source, key, name, status, detail, url, since_at, checked_at`

func scanCheck(row interface{ Scan(...any) error }) (Check, error) {
	var c Check
	err := row.Scan(&c.ID, &c.Source, &c.Key, &c.Name, &c.Status, &c.Detail,
		&c.URL, &c.SinceAt, &c.CheckedAt)
	return c, err
}

// Report replaces what a source knows in one go and returns the checks whose
// status changed, so the caller can decide what deserves a notification.
// Anything the source stops reporting is dropped: a check that no longer
// exists is not a check that is fine.
func (s *Store) Report(ctx context.Context, source string, silentAfter int, checks []CheckReport) ([]Check, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Reporting in clears the silence flag, so a monitor that comes back can
	// be announced as gone again if it dies twice.
	if _, err := tx.Exec(ctx, `
		insert into monitors (source, last_seen_at, silent_after_minutes)
		values ($1, now(), $2)
		on conflict (source) do update
		   set last_seen_at = now(),
		       silent_after_minutes = excluded.silent_after_minutes,
		       stale_notified = false`,
		source, silentAfter); err != nil {
		return nil, err
	}

	changed := []Check{}
	keys := make([]string, 0, len(checks))

	for _, in := range checks {
		keys = append(keys, in.Key)

		// since_at only moves when the status does, which is what makes "down
		// for three days" possible to say.
		var was string
		err := tx.QueryRow(ctx,
			`select status from monitor_checks where source = $1 and key = $2`,
			source, in.Key).Scan(&was)
		if err != nil && err.Error() != "no rows in result set" {
			return nil, err
		}

		row, err := scanCheck(tx.QueryRow(ctx, `
			insert into monitor_checks (source, key, name, status, detail, url,
			                            since_at, checked_at)
			values ($1, $2, $3, $4, $5, $6, now(), now())
			on conflict (source, key) do update
			   set name = excluded.name,
			       status = excluded.status,
			       detail = excluded.detail,
			       url = excluded.url,
			       checked_at = now(),
			       since_at = case when monitor_checks.status = excluded.status
			                       then monitor_checks.since_at else now() end
			returning `+checkCols,
			source, in.Key, in.Name, in.Status, in.Detail, in.URL))
		if err != nil {
			return nil, norm(err)
		}
		if was != row.Status {
			changed = append(changed, row)
		}
	}

	if _, err := tx.Exec(ctx,
		`delete from monitor_checks where source = $1 and key <> all($2::text[])`,
		source, keys); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return changed, nil
}

func (s *Store) Checks(ctx context.Context) ([]Check, error) {
	rows, err := s.pool.Query(ctx, `select `+checkCols+`
		  from monitor_checks
		 -- Trouble first, then oldest trouble first: what has been broken
		 -- longest is what has been ignored longest.
		 order by (status = 'ok'), since_at, lower(name)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Check{}
	for rows.Next() {
		c, err := scanCheck(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Monitors(ctx context.Context) ([]Monitor, error) {
	rows, err := s.pool.Query(ctx, `
		select m.source, m.last_seen_at, m.silent_after_minutes,
		       m.last_seen_at < now() - make_interval(mins => m.silent_after_minutes),
		       count(c.id) filter (where c.status <> 'ok'),
		       count(c.id)
		  from monitors m
		  left join monitor_checks c on c.source = m.source
		 group by m.source, m.last_seen_at, m.silent_after_minutes
		 order by lower(m.source)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Monitor{}
	for rows.Next() {
		var m Monitor
		if err := rows.Scan(&m.Source, &m.LastSeenAt, &m.SilentAfter,
			&m.Stale, &m.Problems, &m.Total); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// Trouble is what is wrong right now, including monitors that have gone quiet.
// The home page and the morning digest both read it.
func (s *Store) Trouble(ctx context.Context) ([]Check, error) {
	rows, err := s.pool.Query(ctx, `select `+checkCols+`
		  from monitor_checks where status <> 'ok'
		 order by since_at, lower(name)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Check{}
	for rows.Next() {
		c, err := scanCheck(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// StaleMonitors are reporters that have stopped reporting. Silence is the
// failure an unattended checker is most likely to have, and the one nothing
// else would notice.
func (s *Store) StaleMonitors(ctx context.Context) ([]Monitor, error) {
	all, err := s.Monitors(ctx)
	if err != nil {
		return nil, err
	}
	out := []Monitor{}
	for _, m := range all {
		if m.Stale {
			out = append(out, m)
		}
	}
	return out, nil
}

// ClaimStale returns the monitors that have just gone quiet, marking them so
// the same silence is not announced twice. A monitor that dies is the failure
// nothing else would notice, and it cannot report its own death.
func (s *Store) ClaimStale(ctx context.Context) ([]Monitor, error) {
	rows, err := s.pool.Query(ctx, `
		update monitors set stale_notified = true
		 where not stale_notified
		   and last_seen_at < now() - make_interval(mins => silent_after_minutes)
		returning source, last_seen_at, silent_after_minutes, true, 0, 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Monitor{}
	for rows.Next() {
		var m Monitor
		if err := rows.Scan(&m.Source, &m.LastSeenAt, &m.SilentAfter,
			&m.Stale, &m.Problems, &m.Total); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
