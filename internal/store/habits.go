package store

import (
	"context"
	"time"
)

/*
Habits, and the days they got done. A day that got done is a row; a day that
did not is the absence of one, so there is no flag anywhere that can disagree
with the record and unticking is a delete.

The two numbers the page shows — the run of days up to now, and how many of
the last seven — are both worked out here rather than in the browser, because
what counts as a run has an opinion in it and it belongs in one place.
*/

// How far back a habit's history is read. Long enough for any run worth
// counting, short enough that the whole thing is one small query.
const habitWindow = 400

type Habit struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Notes  string `json:"notes"`
	Active bool   `json:"active"`
	// The days inside the window the page asked for, as YYYY-MM-DD, so a cell
	// can be drawn without any date arithmetic in the browser.
	Days []string `json:"days"`
	// Consecutive days up to now. Today not being ticked yet does not break
	// it: a habit tracker checked at nine in the morning should not read as a
	// failure before the day has happened.
	Streak int `json:"streak"`
	// Out of the last seven days. This is the honest number for anything that
	// was never meant to be daily.
	LastSeven int `json:"last_seven"`
	/*
		What one day's worth is counted in — "kali", "pasal", "menit" — written
		by hand rather than picked from a list, because the useful unit for a
		habit is whatever its owner already says out loud.

		Empty means the habit is a plain yes or no, which is what every habit
		was before this and what most of them still want to be.
	*/
	Unit string `json:"unit"`
	// Added up across the window that was asked for, and today's on its own.
	// Both are zero for a habit with no unit, where the count of days is the
	// only number that means anything.
	Total float64 `json:"total"`
	Today float64 `json:"today"`
	// The first image attached, if any. Carried on the row so the check-in can
	// show a picture per question without a request per habit.
	ImageID   *int64    `json:"image_id"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type HabitInput struct {
	Name   string `json:"name"`
	Notes  string `json:"notes"`
	Unit   string `json:"unit"`
	Active bool   `json:"active"`
}

const habitCols = `id, name, notes, unit, active,
	created_by, updated_by, created_at, updated_at,
	-- The oldest image attached to this habit. A subquery rather than a join,
	-- because a join would multiply the row by every file on it.
	-- Aliased, and it has to be: without a name of its own the subquery is
	-- also called "id", and the ORDER BY below stops knowing which one.
	(select a.id from attachments a
	  where a.entity = 'habit' and a.entity_id = habits.id
	    and a.deleted_at is null
	    and a.mime_type like 'image/%'
	  order by a.created_at, a.id limit 1) as image_id`

func scanHabit(row interface{ Scan(...any) error }) (Habit, error) {
	var h Habit
	err := row.Scan(&h.ID, &h.Name, &h.Notes, &h.Unit, &h.Active,
		&h.CreatedBy, &h.UpdatedBy, &h.CreatedAt, &h.UpdatedAt, &h.ImageID)
	return h, err
}

// Habits is the whole board: every habit, the days it was done inside the
// window, and the two counts. In creation order, so the rows do not move
// about underneath a finger that is aiming at one of them.
func (s *Store) Habits(ctx context.Context, days int) ([]Habit, error) {
	if days <= 0 || days > 90 {
		days = 7
	}

	rows, err := s.pool.Query(ctx, `select `+habitCols+`
		  from habits where deleted_at is null
		 order by active desc, created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Habit{}
	index := map[int64]int{}
	for rows.Next() {
		habit, err := scanHabit(rows)
		if err != nil {
			return nil, err
		}
		habit.Days = []string{}
		index[habit.ID] = len(out)
		out = append(out, habit)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	// Everything at once rather than a query per habit. The whole history a
	// run could reach across is a few hundred rows.
	ticks, err := s.pool.Query(ctx, `
		select habit_id, on_date, amount
		  from habit_days
		 where on_date >= current_date - $1::int
		 order by habit_id, on_date desc`, habitWindow)
	if err != nil {
		return nil, err
	}
	defer ticks.Close()

	// Per habit, newest first, which is the order a run is counted in.
	type tick struct {
		day    time.Time
		amount float64
	}
	history := map[int64][]tick{}
	for ticks.Next() {
		var id int64
		var t tick
		if err := ticks.Scan(&id, &t.day, &t.amount); err != nil {
			return nil, err
		}
		history[id] = append(history[id], t)
	}
	if err := ticks.Err(); err != nil {
		return nil, err
	}

	today := startOfDay(time.Now())
	for id, done := range history {
		at, ok := index[id]
		if !ok {
			continue
		}
		habit := &out[at]

		// A run is counted in days, not in amounts: three chapters on Monday
		// does not carry Tuesday.
		when := make([]time.Time, len(done))
		for i, t := range done {
			when[i] = t.day
		}
		habit.Streak = streak(when, today)

		for _, t := range done {
			since := int(today.Sub(startOfDay(t.day)).Hours() / 24)
			if since >= 0 && since < days {
				habit.Days = append(habit.Days, t.day.Format("2006-01-02"))
				habit.Total += t.amount
			}
			if since == 0 {
				habit.Today = t.amount
			}
			if since >= 0 && since < 7 {
				habit.LastSeven++
			}
		}
	}
	return out, nil
}

// startOfDay drops the clock, so two dates can be compared as dates. Postgres
// hands back a date at midnight UTC and time.Now() is local, and subtracting
// one from the other without this is off by the offset.
func startOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

/*
streak counts back from now. done must be newest first.

It starts at today when today is ticked and at yesterday when it is not, so a
run survives the hours between waking up and getting round to it. What it will
not do is survive a whole missed day.
*/
func streak(done []time.Time, today time.Time) int {
	// A row dated after today is a bug somewhere upstream. Step past those
	// first, rather than letting one of them decide where counting starts.
	at := 0
	for at < len(done) && startOfDay(done[at]).After(today) {
		at++
	}
	if at == len(done) {
		return 0
	}

	want := today
	if !startOfDay(done[at]).Equal(today) {
		want = today.AddDate(0, 0, -1)
	}

	count := 0
	for ; at < len(done); at++ {
		if !startOfDay(done[at]).Equal(want) {
			break
		}
		count++
		want = want.AddDate(0, 0, -1)
	}
	return count
}

// HabitsUndone names the active habits with nothing recorded for that day, in
// the order the check-in will ask about them. This is what the evening
// notification counts, and an empty result is what makes it stay quiet.
func (s *Store) HabitsUndone(ctx context.Context, day time.Time) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		select h.name
		  from habits h
		 where h.deleted_at is null and h.active
		   and not exists (select 1 from habit_days d
		                    where d.habit_id = h.id and d.on_date = $1)
		 order by h.created_at, h.id`, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

/*
How many of today's habits are ticked, and how many there are. The home page
wants one line about them rather than the whole board, and a pair of counts is
cheaper than sending every habit and its window along with everything else the
overview already carries.

Paused habits are left out, the same as everywhere else: a habit you have
stopped is not a thing you are behind on.
*/
func (s *Store) HabitsToday(ctx context.Context, day time.Time) (done, total int, err error) {
	err = s.pool.QueryRow(ctx, `
		select count(*) filter (where d.habit_id is not null), count(*)
		  from habits h
		  left join habit_days d on d.habit_id = h.id and d.on_date = $1
		 where h.deleted_at is null and h.active`, day).Scan(&done, &total)
	return done, total, err
}

func (s *Store) CreateHabit(ctx context.Context, in HabitInput, actor string) (Habit, error) {
	habit, err := scanHabit(s.pool.QueryRow(ctx, `
		insert into habits (name, notes, unit, created_by, updated_by)
		values ($1, $2, $3, $4, $4)
		returning `+habitCols, in.Name, in.Notes, in.Unit, actor))
	if err != nil {
		return habit, norm(err)
	}
	habit.Days = []string{}
	return habit, nil
}

func (s *Store) UpdateHabit(ctx context.Context, id int64, in HabitInput, actor string) (Habit, error) {
	habit, err := scanHabit(s.pool.QueryRow(ctx, `
		update habits set name = $1, notes = $2, unit = $3, active = $4,
		       updated_by = $5, updated_at = now()
		 where id = $6 and deleted_at is null
		returning `+habitCols, in.Name, in.Notes, in.Unit, in.Active, actor, id))
	if err != nil {
		return habit, norm(err)
	}
	habit.Days = []string{}
	return habit, nil
}

func (s *Store) DeleteHabit(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "habits", id, actor)
}

func (s *Store) RestoreHabit(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "habits", id, actor)
}

/*
SetHabitDay ticks or unticks one day. Ticking twice is not an error and
unticking a day that was never ticked is not either: a tap on a cell should
settle on what it says, not fail because of what it already said.

The amount is what a habit with a unit recorded that day — three chapters, ten
minutes. A plain tick sends 1, which is what the column defaults to, so a habit
with no unit behaves exactly as it did before there were amounts. Ticking a day
that already has an amount overwrites it rather than adding, because the tap
means "this is what today was", not "one more".
*/
func (s *Store) SetHabitDay(ctx context.Context, habitID int64, day time.Time, done bool, amount float64) error {
	if !done {
		_, err := s.pool.Exec(ctx,
			`delete from habit_days where habit_id = $1 and on_date = $2`, habitID, day)
		return err
	}
	if amount <= 0 {
		amount = 1
	}
	_, err := s.pool.Exec(ctx, `
		insert into habit_days (habit_id, on_date, amount) values ($1, $2, $3)
		on conflict (habit_id, on_date) do update set amount = excluded.amount`,
		habitID, day, amount)
	return norm(err)
}
