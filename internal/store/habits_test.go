package store

import (
	"testing"
	"time"
)

// What counts as a run has an opinion in it, and nothing on screen would show
// the opinion being wrong — a number that is quietly one too low still looks
// like a number.

func TestStreakCountsBackFromNow(t *testing.T) {
	today := startOfDay(time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC))
	// Offsets in days before today, newest first, as the query hands them over.
	cases := []struct {
		name string
		ago  []int
		want int
	}{
		{"nothing ever", nil, 0},
		{"today only", []int{0}, 1},
		{"three up to today", []int{0, 1, 2}, 3},

		// The morning problem: today has not happened yet, and a tracker that
		// read as a failure before breakfast would be worse than no tracker.
		{"today still open", []int{1, 2, 3}, 3},
		{"today open and yesterday missed", []int{2, 3}, 0},

		// A whole missed day is a missed day, whatever came before it.
		{"gap two days back", []int{0, 1, 3, 4, 5}, 2},
		{"long run", []int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, 10},

		// A row dated ahead of today is a bug somewhere, not a reason to
		// break the count of the days that did happen.
		{"a day in the future", []int{-1, 0, 1}, 2},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			done := make([]time.Time, 0, len(c.ago))
			for _, ago := range c.ago {
				done = append(done, today.AddDate(0, 0, -ago))
			}
			if got := streak(done, today); got != c.want {
				t.Errorf("got %d, want %d", got, c.want)
			}
		})
	}
}

// Postgres hands a date back at midnight UTC while time.Now() carries a local
// clock, and subtracting one from the other without flattening both is off by
// the offset — which shows up as a run that is a day short.
func TestStreakIgnoresTheClock(t *testing.T) {
	jakarta := time.FixedZone("WIB", 7*60*60)
	today := startOfDay(time.Date(2026, 9, 7, 23, 30, 0, 0, jakarta))

	done := []time.Time{
		time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 9, 6, 0, 0, 0, 0, time.UTC),
	}
	if got := streak(done, today); got != 2 {
		t.Errorf("got %d, want 2", got)
	}
}
