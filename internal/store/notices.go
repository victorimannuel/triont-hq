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
func (s *Store) ClaimEventNotice(ctx context.Context, key string, day time.Time) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		insert into event_notices (event_key, sent_on) values ($1, $2)
		on conflict (event_key, sent_on) do nothing`, key, day)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// ForgetOldNotices keeps the table from growing for ever. Anything this old
// cannot come round again under the same key, because the key holds its date.
func (s *Store) ForgetOldNotices(ctx context.Context, olderThan time.Duration) error {
	_, err := s.pool.Exec(ctx,
		`delete from event_notices where sent_at < $1`, time.Now().Add(-olderThan))
	return err
}
