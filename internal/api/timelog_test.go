package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

/*
What the work log refuses.

The one that matters is the swapped pair. The store clamps a backwards entry to
zero seconds, so without this check a typo would save quietly and then count as
nothing — a row on the page saying it took no time at all, with no hint that
anything was wrong with it.
*/
func TestSwappedEndIsRefused(t *testing.T) {
	nine := time.Date(2026, 9, 15, 9, 0, 0, 0, time.UTC).Format(time.RFC3339)
	eight := time.Date(2026, 9, 15, 8, 0, 0, 0, time.UTC).Format(time.RFC3339)

	if endsAfterStart(store.TimeEntryInput{StartedAt: nine, EndedAt: eight}) {
		t.Error("an end an hour before its start was allowed")
	}
	if !endsAfterStart(store.TimeEntryInput{StartedAt: eight, EndedAt: nine}) {
		t.Error("an ordinary hour was refused")
	}
}

// Both fields are optional in their own right: an empty start means now and an
// empty end means still running, so neither can be treated as a swap.
func TestOpenEndedEntriesPassTheCheck(t *testing.T) {
	nine := time.Date(2026, 9, 15, 9, 0, 0, 0, time.UTC).Format(time.RFC3339)
	for _, in := range []store.TimeEntryInput{
		{StartedAt: nine},
		{EndedAt: nine},
		{},
	} {
		if !endsAfterStart(in) {
			t.Errorf("%+v was refused", in)
		}
	}
}

/*
A part with no project above it would sit in the summary as a bare "NPD" with
nothing to say whose it is, so it gets dropped rather than kept.
*/
func TestPartNeedsAProject(t *testing.T) {
	var s Server

	in, msg := s.readTimeEntry(post(`{"project_id":null,"part":"NPD","note":"","started_at":"","ended_at":""}`))
	if msg != "" {
		t.Fatalf("refused with %q", msg)
	}
	if in.Part != "" {
		t.Errorf("part survived without a project: %q", in.Part)
	}

	in, msg = s.readTimeEntry(post(`{"project_id":1,"part":"  NPD  ","note":"","started_at":"","ended_at":""}`))
	if msg != "" {
		t.Fatalf("refused with %q", msg)
	}
	if in.Part != "NPD" {
		t.Errorf("part: got %q, want %q", in.Part, "NPD")
	}
}

func post(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/api/time", strings.NewReader(body))
}

func TestBadMomentIsCaughtBeforeTheStore(t *testing.T) {
	if msg := badMoment("15 September"); msg == "" {
		t.Error("a date that is not RFC3339 was accepted")
	}
	if msg := badMoment(""); msg != "" {
		t.Errorf("empty was refused with %q", msg)
	}
	if msg := badMoment(time.Now().Format(time.RFC3339)); msg != "" {
		t.Errorf("a real timestamp was refused with %q", msg)
	}
}
