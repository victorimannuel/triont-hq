package store

import (
	"testing"
	"time"
)

/*
How long an entry ran.

One subtraction, which is why it is worth pinning down: every total on the page
is a sum of these, and a stretch that comes out wrong shows up as a plausible
number rather than as an error.
*/

func at(hour, minute int) time.Time {
	return time.Date(2026, 9, 15, hour, minute, 0, 0, time.UTC)
}

func TestFinishedEntryCountsItsSpan(t *testing.T) {
	end := at(11, 30)
	entry := TimeEntry{StartedAt: at(9, 0), EndedAt: &end}
	if got := entry.elapsed(); got != 9000 {
		t.Errorf("got %d seconds, want 9000", got)
	}
}

// A clock still going has to count up to now, or the card that shows it would
// sit at whatever it read when the page loaded.
func TestRunningEntryCountsToNow(t *testing.T) {
	entry := TimeEntry{StartedAt: time.Now().Add(-90 * time.Second)}
	if got := entry.elapsed(); got < 89 || got > 92 {
		t.Errorf("got %d seconds, want about 90", got)
	}
}

/*
An end typed before its start is a typo. It must come out as zero rather than
as a negative stretch: a day whose total went *down* because of one bad row is
far harder to spot than one that simply does not add up.
*/
func TestBackwardsEntryCountsNothing(t *testing.T) {
	end := at(8, 0)
	entry := TimeEntry{StartedAt: at(9, 0), EndedAt: &end}
	if got := entry.elapsed(); got != 0 {
		t.Errorf("got %d seconds, want 0", got)
	}
}

// An empty end is how the form says "still running", and it has to survive the
// round trip as a null rather than as the zero time.
func TestEmptyEndMeansStillRunning(t *testing.T) {
	started, ended, err := parseSpan(TimeEntryInput{
		StartedAt: at(9, 0).Format(time.RFC3339),
		EndedAt:   "  ",
	})
	if err != nil {
		t.Fatalf("parseSpan: %v", err)
	}
	if ended != nil {
		t.Errorf("got an end of %v, want none", *ended)
	}
	if !started.Equal(at(9, 0)) {
		t.Errorf("start: got %v, want %v", started, at(9, 0))
	}
}

// An empty start means now, which is what pressing start means.
func TestEmptyStartMeansNow(t *testing.T) {
	started, _, err := parseSpan(TimeEntryInput{})
	if err != nil {
		t.Fatalf("parseSpan: %v", err)
	}
	if time.Since(started) > time.Second {
		t.Errorf("start: got %v, want about now", started)
	}
}
