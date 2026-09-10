package store

import (
	"context"
	"time"
)

// Overview is what the home page shows, gathered in one place so the handler
// has one error to check rather than several. Everything in it wants doing:
// what falls due, what has run out, what is broken, whether tonight's habits
// are ticked. The record counts and monthly totals that used to ride along
// were reference figures with pages of their own, and the page stopped
// showing them.
type Overview struct {
	Upcoming []CalendarEntry `json:"upcoming"`
	// What has run out, and what is broken. Both are short by nature and both
	// are read to decide what to do next, so they travel whole rather than as
	// counts the page would have to fetch again to explain.
	LowSupplies   []Supply  `json:"low_supplies"`
	Trouble       []Check   `json:"trouble"`
	StaleMonitors []Monitor `json:"stale_monitors"`
	// Today's habits, as a tally rather than a board. Enough for the home page
	// to say whether the evening's ticking has been done yet.
	HabitsDone  int `json:"habits_done"`
	HabitsTotal int `json:"habits_total"`
}

// How far ahead each kind of deadline is worth worrying about. A domain can be
// renewed in an afternoon; a passport cannot, so it gets a longer runway.
const (
	// A month, which the page narrows to a week when asked. Anything further
	// out is the calendar's job: a home page that mixes "besok" with "tiga
	// bulan lagi" stops being a to-do list.
	upcomingWindowDays = 30
	// Generous enough that the month view is never quietly cut short, and
	// still a bound.
	upcomingRows = 60
)

func (s *Store) Overview(ctx context.Context) (Overview, error) {
	var o Overview
	var err error

	// A birthday, a domain renewal and a passport running out are the same
	// fact — something falls due on a day — so the page gets one list of them
	// rather than a section per module.
	if o.Upcoming, err = s.DueWithin(ctx, upcomingWindowDays); err != nil {
		return o, err
	}
	if len(o.Upcoming) > upcomingRows {
		o.Upcoming = o.Upcoming[:upcomingRows]
	}
	if o.LowSupplies, err = s.LowSupplies(ctx); err != nil {
		return o, err
	}
	if o.Trouble, err = s.Trouble(ctx); err != nil {
		return o, err
	}
	if o.StaleMonitors, err = s.StaleMonitors(ctx); err != nil {
		return o, err
	}
	if o.HabitsDone, o.HabitsTotal, err = s.HabitsToday(ctx, startOfDay(time.Now())); err != nil {
		return o, err
	}
	return o, nil
}
