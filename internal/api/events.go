package api

import (
	"context"
	"fmt"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// One deadline, one notification. The morning roundup is good at states — what
// has run out, what is broken — but a dated thing wants its own line on the
// lock screen, dismissible on its own, arriving when it is still useful.

/*
How far ahead each kind is announced, in days. The number is not a guess about
importance, it is how long the thing takes to act on: a birthday is only worth
knowing on the day, a passport that has expired is worth a fortnight's warning
because renewing one is not a same-day errand.

Editing this table is the whole knob. Nothing else reads the numbers.
*/
var leadDays = map[string]int{
	"birthday":    0,
	"maintenance": 3,
	"rent":        3,
	"income":      3,
	"expense":     3,
	"renewal":     7,
	"warranty":    7,
	"document":    14,
}

// Anything the calendar grows later still gets announced, just with a middling
// amount of warning rather than none.
const defaultLead = 3

// The furthest any kind looks ahead, which is how wide the query has to be.
func widestLead() int {
	widest := defaultLead
	for _, days := range leadDays {
		if days > widest {
			widest = days
		}
	}
	return widest
}

func leadFor(kind string) int {
	if days, ok := leadDays[kind]; ok {
		return days
	}
	return defaultLead
}

/*
announceDueEvents sends one push per deadline that has come within reach.

It fires on "close enough" rather than "exactly today" on purpose. A server
that was down on the morning something was due should still say so late; only
the claim in the database decides that it has been said at all.
*/
func (s *Server) announceDueEvents(ctx context.Context) {
	entries, err := s.store.DueWithin(ctx, widestLead())
	if err != nil {
		s.log.Error("event notices", "err", err)
		return
	}

	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil {
		s.log.Error("event subscriptions", "err", err)
		return
	}

	today := time.Now()
	sent := 0
	for _, entry := range entries {
		days := daysUntil(today, entry.Date)
		if days > leadFor(entry.Kind) {
			continue
		}

		key := noticeKey(entry)
		claimed, err := s.store.ClaimEventNotice(ctx, key)
		if err != nil {
			s.log.Error("claim event notice", "key", key, "err", err)
			continue
		}
		if !claimed {
			continue
		}

		if len(subs) > 0 {
			s.pushEach(ctx, subs, func(lang string) payload {
				return payload{
					Title: entry.Label,
					Body:  textEventDue(lang, entry.Kind, days),
					URL:   entry.URL,
					// Its own tag, so several falling on one day stack as
					// separate notifications instead of replacing each other.
					Tag: "hq-event-" + key,
				}
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
