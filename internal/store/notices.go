package store

import (
	"context"
	"time"
)

/*
ClaimEventNotice reserves the right to announce one deadline, and reports
whether this caller got it. The insert is the claim: a second attempt for the
same key conflicts and returns false, so a restart in the middle of a morning
cannot send the same birthday twice.

The key has to identify one occurrence rather than one record — a birthday
comes round every year and each year deserves its own notification.
*/
func (s *Store) ClaimEventNotice(ctx context.Context, key string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		insert into event_notices (event_key) values ($1)
		on conflict (event_key) do nothing`, key)
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
