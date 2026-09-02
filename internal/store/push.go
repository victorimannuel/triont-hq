package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// PushSubscription is one browser that agreed to receive notifications. The
// endpoint is the browser's own push service URL and is what identifies it, so
// re-subscribing from the same device updates rather than duplicates.
type PushSubscription struct {
	ID     int64  `json:"id"`
	Device string `json:"device"`
	// Which language the digest for this device is written in, taken from the
	// app's toggle at the moment it subscribed.
	Lang       string     `json:"lang"`
	Endpoint   string     `json:"-"`
	P256dh     string     `json:"-"`
	Auth       string     `json:"-"`
	CreatedAt  time.Time  `json:"created_at"`
	LastSentAt *time.Time `json:"last_sent_at"`
	Failures   int        `json:"failures"`
}

const subscriptionColumns = `id, device, lang, endpoint, p256dh, auth, created_at, last_sent_at, failures`

func (s *Store) Subscribe(ctx context.Context, userID int64, sub PushSubscription) error {
	_, err := s.pool.Exec(ctx, `
		insert into push_subscriptions (user_id, endpoint, p256dh, auth, device, lang)
		values ($1, $2, $3, $4, $5, $6)
		on conflict (endpoint) do update
		   set p256dh = excluded.p256dh,
		       auth = excluded.auth,
		       device = excluded.device,
		       lang = excluded.lang,
		       failures = 0`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth, sub.Device, sub.Lang)
	return err
}

func scanSubscriptions(rows pgx.Rows) ([]PushSubscription, error) {
	defer rows.Close()

	out := []PushSubscription{}
	for rows.Next() {
		var p PushSubscription
		if err := rows.Scan(&p.ID, &p.Device, &p.Lang, &p.Endpoint, &p.P256dh, &p.Auth,
			&p.CreatedAt, &p.LastSentAt, &p.Failures); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) Subscriptions(ctx context.Context, userID int64) ([]PushSubscription, error) {
	rows, err := s.pool.Query(ctx, `select `+subscriptionColumns+`
		  from push_subscriptions where user_id = $1 order by created_at`, userID)
	if err != nil {
		return nil, err
	}
	return scanSubscriptions(rows)
}

// AllSubscriptions is what the daily reminder sends to. It ignores the user,
// because there is only ever one.
func (s *Store) AllSubscriptions(ctx context.Context) ([]PushSubscription, error) {
	rows, err := s.pool.Query(ctx, `select `+subscriptionColumns+`
		  from push_subscriptions order by created_at`)
	if err != nil {
		return nil, err
	}
	return scanSubscriptions(rows)
}

func (s *Store) Unsubscribe(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx,
		`delete from push_subscriptions where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UnsubscribeEndpoint drops a subscription the push service has rejected as
// gone — an uninstalled app, or permission withdrawn.
func (s *Store) UnsubscribeEndpoint(ctx context.Context, endpoint string) error {
	_, err := s.pool.Exec(ctx,
		`delete from push_subscriptions where endpoint = $1`, endpoint)
	return err
}

func (s *Store) MarkPushed(ctx context.Context, id int64, failed bool) error {
	if failed {
		_, err := s.pool.Exec(ctx,
			`update push_subscriptions set failures = failures + 1 where id = $1`, id)
		return err
	}
	_, err := s.pool.Exec(ctx,
		`update push_subscriptions set last_sent_at = now(), failures = 0 where id = $1`, id)
	return err
}

// ClaimDigest records that today's reminder has gone out and reports whether
// this call is the one that claimed it. A restart mid-day therefore cannot
// send the same digest twice.
func (s *Store) ClaimDigest(ctx context.Context, day time.Time) (bool, error) {
	tag, err := s.pool.Exec(ctx,
		`insert into push_digests (sent_on) values ($1) on conflict do nothing`,
		day.Format("2006-01-02"))
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
