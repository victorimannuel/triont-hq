package store

import (
	"context"
	"time"
)

/*
ClaimEventNotice reserves the right to announce one deadline on one morning,
and reports whether this caller got it. The insert is the claim: a second
attempt for the same deadline on the same day conflicts and returns false, so
a restart mid-morning cannot say the same thing twice.

The day is part of the claim because a deadline speaks every morning of the
week before it lands. What must not repeat is one deadline on one day.
*/
func (s *Store) ClaimEventNotice(ctx context.Context, key, label string, day time.Time) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		insert into event_notices (event_key, sent_on, label) values ($1, $2, $3)
		on conflict (event_key, sent_on) do nothing`, key, day, label)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// NoticeRow is one notification that went out. The key comes back untouched:
// what it means is the API's business, because that is where its shape was
// decided.
type NoticeRow struct {
	SentOn time.Time
	SentAt time.Time
	Key    string
	Label  string
	// Null until it has been read. A pointer rather than a bool because when
	// it was read is worth keeping even though nothing shows it yet.
	ReadAt *time.Time
}

// NoticeLog is what has actually been sent over the last so many days, newest
// first. The daily roundup joins the list with an empty key, because it is not
// about any one deadline.
func (s *Store) NoticeLog(ctx context.Context, days int) ([]NoticeRow, error) {
	if days <= 0 || days > 400 {
		days = 30
	}
	rows, err := s.pool.Query(ctx, `
		select sent_on, sent_at, event_key, label, read_at
		  from event_notices
		 where sent_on >= current_date - $1::int
		union all
		select sent_on, sent_at, '', '', read_at
		  from push_digests
		 where sent_on >= current_date - $1::int
		 order by sent_at desc`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []NoticeRow{}
	for rows.Next() {
		var n NoticeRow
		if err := rows.Scan(&n.SentOn, &n.SentAt, &n.Key, &n.Label, &n.ReadAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

/*
MarkNoticeRead marks one notification read, or every unread one at once when
the key and day are left empty.

An empty key with a day names the roundup for that morning, which lives in its
own table because it is not about any one deadline. Marking something already
read is not an error: two taps on the same row should settle, not fail.
*/
func (s *Store) MarkNoticeRead(ctx context.Context, key string, day time.Time) error {
	if key == "" && day.IsZero() {
		if _, err := s.pool.Exec(ctx,
			`update event_notices set read_at = now() where read_at is null`); err != nil {
			return err
		}
		_, err := s.pool.Exec(ctx,
			`update push_digests set read_at = now() where read_at is null`)
		return err
	}

	if key == "" {
		_, err := s.pool.Exec(ctx,
			`update push_digests set read_at = now()
			  where sent_on = $1 and read_at is null`, day)
		return err
	}

	_, err := s.pool.Exec(ctx,
		`update event_notices set read_at = now()
		  where event_key = $1 and sent_on = $2 and read_at is null`, key, day)
	return err
}

// UnreadNotices is what the badge counts. Both tables, because the roundup is
// as unread as anything else.
func (s *Store) UnreadNotices(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		select (select count(*) from event_notices where read_at is null)
		     + (select count(*) from push_digests  where read_at is null)`).Scan(&n)
	return n, err
}

// ForgetOldNotices keeps the table from growing for ever. Anything this old
// cannot come round again under the same key, because the key holds its date.
func (s *Store) ForgetOldNotices(ctx context.Context, olderThan time.Duration) error {
	_, err := s.pool.Exec(ctx,
		`delete from event_notices where sent_at < $1`, time.Now().Add(-olderThan))
	return err
}
