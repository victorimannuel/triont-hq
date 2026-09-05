package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// A notification is the only part of HQ that leaves no trace where you can go
// back and look at it. This is that trace: what was sent, what it was about,
// and whether it has been dealt with.

// noticeLogEntry is one sent notification as the rest of the app talks about
// it. The key is unpacked here rather than in the store because this package
// is where its shape was decided, and it is handed back whole as well so a row
// can say which one it is when it gets marked read.
type noticeLogEntry struct {
	Key    string `json:"key"`
	SentOn string `json:"sent_on"`
	SentAt string `json:"sent_at"`
	Kind   string `json:"kind"`
	Label  string `json:"label"`
	URL    string `json:"url"`
	DueOn  string `json:"due_on"`
	Read   bool   `json:"read"`
}

func (s *Server) noticeLog(ctx context.Context, days int) ([]noticeLogEntry, error) {
	rows, err := s.store.NoticeLog(ctx, days)
	if err != nil {
		return nil, err
	}

	out := make([]noticeLogEntry, 0, len(rows))
	for _, row := range rows {
		entry := noticeLogEntry{
			Key:    row.Key,
			SentOn: row.SentOn.Format("2006-01-02"),
			SentAt: row.SentAt.Format(time.RFC3339),
			Label:  row.Label,
			Read:   row.ReadAt != nil,
			// No key means the roundup, which is about everything at once and
			// so about no single deadline.
			Kind: "digest",
		}
		// "kind|url|date", the shape noticeKey builds.
		if parts := strings.Split(row.Key, "|"); len(parts) == 3 {
			entry.Kind, entry.URL, entry.DueOn = parts[0], parts[1], parts[2]
		}
		out = append(out, entry)
	}
	return out, nil
}

func (s *Server) handleNotices(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	log, err := s.noticeLog(r.Context(), days)
	if err != nil {
		s.oops(w, err)
		return
	}
	unread, err := s.store.UnreadNotices(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notices": log, "unread": unread})
}

// handleUnreadNotices is what the badge in the sidebar asks for. It is its own
// endpoint because the badge is on every page and the list is on one.
func (s *Server) handleUnreadNotices(w http.ResponseWriter, r *http.Request) {
	unread, err := s.store.UnreadNotices(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"unread": unread})
}

type readRequest struct {
	// Empty key with a day means the roundup for that morning; both empty
	// means everything still unread.
	Key    string `json:"key"`
	SentOn string `json:"sent_on"`
	All    bool   `json:"all"`
}

func (s *Server) handleMarkNoticeRead(w http.ResponseWriter, r *http.Request) {
	var in readRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "nggak kebaca")
		return
	}

	var day time.Time
	if !in.All {
		parsed, err := time.Parse("2006-01-02", in.SentOn)
		if err != nil {
			fail(w, http.StatusBadRequest, "tanggalnya nggak kebaca")
			return
		}
		day = parsed
	}

	if err := s.store.MarkNoticeRead(r.Context(), in.Key, day); err != nil {
		s.oops(w, err)
		return
	}
	s.handleUnreadNotices(w, r)
}
