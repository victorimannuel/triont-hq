package api

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// One deadline, one notification of its own — not a line inside a roundup. The
// morning digest is left with what has no date: what has run out, what is
// broken. Anything with a day on it speaks for itself.

/*
How far ahead a deadline starts speaking, and it speaks every morning from
there until the day itself. A week is long enough to renew a domain or book a
service, and short enough that the week before is still the week you would
have acted in anyway.

Once the day has passed it goes quiet. A thing you missed is on the calendar in
red; it does not need to keep waking your phone.
*/
const noticeLead = 7

// upcoming is one deadline as a notification is about to describe it: already
// counted in days, already carrying the key that keeps it from being announced
// twice in a morning.
type upcoming struct {
	Key   string
	Kind  string
	Label string
	URL   string
	Days  int
	// The number a milestone is about; zero for every other kind.
	Count int
}

// dueNow is every deadline the morning would speak about, soonest first.
func (s *Server) dueNow(ctx context.Context) []upcoming {
	entries, err := s.store.DueWithin(ctx, noticeLead)
	if err != nil {
		s.log.Error("due events", "err", err)
		return nil
	}

	today := time.Now()
	out := make([]upcoming, 0, len(entries))
	for _, entry := range entries {
		days := daysUntil(today, entry.Date)
		// Before the window it is too early to be useful; after the day it is
		// too late to be a reminder.
		if days < 0 || days > noticeLead {
			continue
		}
		out = append(out, upcoming{
			Key:   noticeKey(entry),
			Kind:  entry.Kind,
			Label: entry.Label,
			URL:   entry.URL,
			Days:  days,
			Count: entry.Count,
		})
	}

	sort.SliceStable(out, func(i, j int) bool { return out[i].Days < out[j].Days })
	return out
}

// eventPayload is the one place a deadline is worded, so the morning run and
// the test button cannot drift apart.
func eventPayload(due upcoming, lang string) payload {
	return payload{
		Title: due.Label,
		Body:  textEventDue(lang, due.Kind, due.Count, due.Days),
		URL:   due.URL,
		// Stable across the week, so each morning's copy replaces the last
		// instead of piling up.
		Tag: "hq-event-" + due.Key,
	}
}

/*
announceDueEvents sends one push per deadline inside the window, once each
morning. The same notification tag is reused across days on purpose: the phone
replaces yesterday's copy rather than stacking eight of them, so it alerts
again each morning without the tray filling up.
*/
func (s *Server) announceDueEvents(ctx context.Context) {
	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil {
		s.log.Error("event subscriptions", "err", err)
		return
	}

	// The calendar day this run belongs to, which is what a claim is made
	// against — two runs in one morning must not say the same thing twice.
	y, m, d := time.Now().Date()
	day := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)

	sent := 0
	for _, due := range s.dueNow(ctx) {
		claimed, err := s.store.ClaimEventNotice(ctx, due.Key, day)
		if err != nil {
			s.log.Error("claim event notice", "key", due.Key, "err", err)
			continue
		}
		if !claimed {
			continue
		}

		if len(subs) > 0 {
			s.pushEach(ctx, subs, func(lang string) payload {
				return eventPayload(due, lang)
			})
		}
		sent++
	}

	if sent > 0 {
		s.log.Info("event notices sent", "events", sent, "devices", len(subs))
	}
	// A key holds its own date, so an old row can never be claimed again.
	if err := s.store.ForgetOldNotices(ctx, 400*24*time.Hour); err != nil {
		s.log.Error("forget old notices", "err", err)
	}
}

// noticeKey identifies one occurrence: the same birthday next year is a
// different date and therefore a different key.
func noticeKey(entry store.CalendarEntry) string {
	return fmt.Sprintf("%s|%s|%s", entry.Kind, entry.URL, entry.Date.Format("2006-01-02"))
}

/*
Whole days from today, negative once the date has gone by.

Counted as calendar days rather than by subtracting instants. Truncating a
time to 24 hours snaps it to midnight UTC, not to midnight here — so between
local midnight and seven in the morning, which is exactly when this runs, a
birthday today reads as a birthday tomorrow and stays silent for a day.

`today` is a moment in the server's own zone; `date` comes from a date column,
stored at midnight UTC, and its calendar day is the whole of its meaning.
*/
func daysUntil(today, date time.Time) int {
	y1, m1, d1 := today.Date()
	y2, m2, d2 := date.UTC().Date()
	here := time.Date(y1, m1, d1, 0, 0, 0, 0, time.UTC)
	there := time.Date(y2, m2, d2, 0, 0, 0, 0, time.UTC)
	return int(there.Sub(here).Hours() / 24)
}
