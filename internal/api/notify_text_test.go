package api

import (
	"testing"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// A notification is written on the server and read on a locked phone, so there
// is no screen anywhere that would show these strings being wrong.

func entries(n int) []store.CalendarEntry {
	out := make([]store.CalendarEntry, n)
	for i := range out {
		out[i] = store.CalendarEntry{Label: "thing"}
	}
	return out
}

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

func TestDigestTitleSpeaksBothLanguages(t *testing.T) {
	cases := []struct {
		name              string
		due, low, trouble int
		wantID, wantEN    string
	}{
		{"one due", 1, 0, 0, "1 tenggat minggu ini", "1 deadline this week"},
		{"several due", 3, 0, 0, "3 tenggat minggu ini", "3 deadlines this week"},
		{"one low", 0, 1, 0, "1 stok menipis", "1 supply running low"},
		{"both", 2, 1, 0, "2 tenggat, 1 stok menipis", "2 deadlines, 1 supply running low"},
		// Something broken outranks the rest, whatever else is due.
		{"trouble wins", 5, 5, 1, "1 hal bermasalah", "1 thing in trouble"},
		{"trouble plural", 0, 0, 2, "2 hal bermasalah", "2 things in trouble"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			due, low, trouble := entries(c.due), supplies(c.low), checks(c.trouble)
			if got := digestTitle("id", due, low, trouble); got != c.wantID {
				t.Errorf("id: got %q, want %q", got, c.wantID)
			}
			if got := digestTitle("en", due, low, trouble); got != c.wantEN {
				t.Errorf("en: got %q, want %q", got, c.wantEN)
			}
		})
	}
}

// An unknown or absent language must not produce an empty notification.
func TestUnknownLanguageFallsBackToIndonesian(t *testing.T) {
	for _, lang := range []string{"", "fr", "en-GB", "ID"} {
		if got := digestTitle(lang, entries(2), nil, nil); got != "2 tenggat minggu ini" {
			t.Errorf("lang %q: got %q", lang, got)
		}
	}
}

func TestDigestBodyNamesThenCounts(t *testing.T) {
	// Four names is one more than the notification has room for.
	low := []store.Supply{{Name: "tisu"}, {Name: "sabun"}, {Name: "kopi"}, {Name: "garam"}}
	if got, want := digestBody("id", nil, low, nil),
		"beli: tisu, sabun, kopi, dan 1 lagi"; got != want {
		t.Errorf("id: got %q, want %q", got, want)
	}
	if got, want := digestBody("en", nil, low, nil),
		"buy: tisu, sabun, kopi, and 1 more"; got != want {
		t.Errorf("en: got %q, want %q", got, want)
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
