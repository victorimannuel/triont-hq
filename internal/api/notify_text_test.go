package api

import (
	"testing"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// A notification is written on the server and read on a locked phone, so there
// is no screen anywhere that would show these strings being wrong.

func supplies(n int) []store.Supply {
	out := make([]store.Supply, n)
	for i := range out {
		out[i] = store.Supply{Name: "tisu"}
	}
	return out
}

func checks(n int) []store.Check {
	out := make([]store.Check, n)
	for i := range out {
		out[i] = store.Check{Name: "nginx"}
	}
	return out
}

// The roundup is left with what has no date; dated things get their own push.
func TestDigestTitleSpeaksBothLanguages(t *testing.T) {
	cases := []struct {
		name           string
		low, trouble   int
		wantID, wantEN string
	}{
		{"one low", 1, 0, "1 stok menipis", "1 supply running low"},
		{"several low", 4, 0, "4 stok menipis", "4 supplies running low"},
		// Something broken outranks the shopping list.
		{"trouble wins", 5, 1, "1 hal bermasalah", "1 thing in trouble"},
		{"trouble plural", 0, 2, "2 hal bermasalah", "2 things in trouble"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			low, trouble := supplies(c.low), checks(c.trouble)
			if got := digestTitle("id", low, trouble); got != c.wantID {
				t.Errorf("id: got %q, want %q", got, c.wantID)
			}
			if got := digestTitle("en", low, trouble); got != c.wantEN {
				t.Errorf("en: got %q, want %q", got, c.wantEN)
			}
		})
	}
}

// An unknown or absent language must not produce an empty notification.
func TestUnknownLanguageFallsBackToIndonesian(t *testing.T) {
	for _, lang := range []string{"", "fr", "en-GB", "ID"} {
		if got := digestTitle(lang, supplies(2), nil); got != "2 stok menipis" {
			t.Errorf("lang %q: got %q", lang, got)
		}
	}
}

func TestDigestBodyNamesThenCounts(t *testing.T) {
	// Four names is one more than the notification has room for.
	low := []store.Supply{{Name: "tisu"}, {Name: "sabun"}, {Name: "kopi"}, {Name: "garam"}}
	if got, want := digestBody("id", low, nil),
		"beli: tisu, sabun, kopi, dan 1 lagi"; got != want {
		t.Errorf("id: got %q, want %q", got, want)
	}
	if got, want := digestBody("en", low, nil),
		"buy: tisu, sabun, kopi, and 1 more"; got != want {
		t.Errorf("en: got %q, want %q", got, want)
	}
}

// One deadline, one line: what sort of thing it is and how long there is.
func TestEventDueReadsAtAGlance(t *testing.T) {
	cases := []struct {
		kind           string
		days           int
		wantID, wantEN string
	}{
		{"birthday", 0, "ulang tahun · hari ini", "birthday · today"},
		{"birthday", 1, "ulang tahun · besok", "birthday · tomorrow"},
		{"renewal", 7, "perpanjangan · 7 hari lagi", "renewal · in 7 days"},
		{"document", 14, "masa berlaku dokumen · 14 hari lagi", "document expiry · in 14 days"},
		{"renewal", -1, "perpanjangan · telat 1 hari", "renewal · 1 day late"},
		{"renewal", -3, "perpanjangan · telat 3 hari", "renewal · 3 days late"},
		// A kind the calendar grows later still reads sensibly.
		{"whatever", 2, "whatever · 2 hari lagi", "whatever · in 2 days"},
	}
	for _, c := range cases {
		if got := textEventDue("id", c.kind, c.days); got != c.wantID {
			t.Errorf("id %s/%d: got %q, want %q", c.kind, c.days, got, c.wantID)
		}
		if got := textEventDue("en", c.kind, c.days); got != c.wantEN {
			t.Errorf("en %s/%d: got %q, want %q", c.kind, c.days, got, c.wantEN)
		}
	}
}

// The key has to name one occurrence, not one record, or a birthday would be
// announced once and never again.
func TestNoticeKeyIsPerOccurrence(t *testing.T) {
	entry := store.CalendarEntry{
		Kind: "birthday",
		URL:  "/people/7",
		Date: time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC),
	}
	nextYear := entry
	nextYear.Date = entry.Date.AddDate(1, 0, 0)

	if noticeKey(entry) == noticeKey(nextYear) {
		t.Error("same key for two years, so next year would never be announced")
	}
	if got, want := noticeKey(entry), "birthday|/people/7|2026-09-10"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestLeadTimeMatchesHowLongActingTakes(t *testing.T) {
	// A birthday is only worth knowing on the day; a document takes weeks.
	if leadFor("birthday") != 0 {
		t.Errorf("birthday should land on the day, got %d", leadFor("birthday"))
	}
	if leadFor("document") <= leadFor("maintenance") {
		t.Error("renewing a document takes longer to arrange than a service")
	}
	// Anything the calendar grows later still gets some warning.
	if leadFor("something-new") != defaultLead {
		t.Errorf("unknown kind should fall back, got %d", leadFor("something-new"))
	}
	if widestLead() < leadFor("document") {
		t.Error("the query window has to reach the furthest lead")
	}
}

/*
The digest runs at seven in the morning, and east of UTC that moment is still
"yesterday" in UTC. Counting by instants rather than by calendar days made a
birthday today read as a birthday tomorrow, so it stayed silent on the one
morning it mattered. This is that morning.
*/
func TestDaysUntilCountsCalendarDaysNotInstants(t *testing.T) {
	jakarta := time.FixedZone("WIB", 7*3600)
	// 07:00 on the 4th in Jakarta is 00:00 on the 4th UTC — but 06:00 is still
	// the 3rd in UTC, which is where the old arithmetic went wrong.
	morning := time.Date(2026, 9, 4, 6, 0, 0, 0, jakarta)
	dateOf := func(y int, m time.Month, d int) time.Time {
		return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	}

	cases := []struct {
		date time.Time
		want int
	}{
		{dateOf(2026, 9, 4), 0},  // today
		{dateOf(2026, 9, 5), 1},  // tomorrow
		{dateOf(2026, 9, 11), 7}, // a week out
		{dateOf(2026, 9, 3), -1}, // yesterday, already missed
	}
	for _, c := range cases {
		if got := daysUntil(morning, c.date); got != c.want {
			t.Errorf("%s from %s: got %d, want %d",
				c.date.Format("2006-01-02"), morning.Format(time.RFC3339), got, c.want)
		}
	}

	// And the same answer whatever hour of the local day it is asked at.
	for _, hour := range []int{0, 6, 7, 12, 23} {
		at := time.Date(2026, 9, 4, hour, 30, 0, 0, jakarta)
		if got := daysUntil(at, dateOf(2026, 9, 4)); got != 0 {
			t.Errorf("at %02d:30 local, today reads as %d days away", hour, got)
		}
	}
}

func TestSinceReadsAsAnAge(t *testing.T) {
	cases := []struct {
		ago            time.Duration
		wantID, wantEN string
	}{
		{90 * time.Second, "1 menit", "1 minute"},
		{30 * time.Minute, "30 menit", "30 minutes"},
		{3 * time.Hour, "3 jam", "3 hours"},
		{72 * time.Hour, "3 hari", "3 days"},
	}
	for _, c := range cases {
		at := time.Now().Add(-c.ago)
		if got := since("id", at); got != c.wantID {
			t.Errorf("id %v: got %q, want %q", c.ago, got, c.wantID)
		}
		if got := since("en", at); got != c.wantEN {
			t.Errorf("en %v: got %q, want %q", c.ago, got, c.wantEN)
		}
	}
}
