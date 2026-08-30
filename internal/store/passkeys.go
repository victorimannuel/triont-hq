package store

import (
	"context"
	"encoding/json"
	"time"
)

// Passkey is one registered WebAuthn credential. The credential itself is kept
// as raw JSON because its shape belongs to the WebAuthn library, not to us.
type Passkey struct {
	ID         int64           `json:"id"`
	Name       string          `json:"name"`
	Device     string          `json:"device"`
	UserAgent  string          `json:"user_agent"`
	Location   string          `json:"location"`
	IP         string          `json:"ip"`
	CreatedAt  time.Time       `json:"created_at"`
	LastUsedAt *time.Time      `json:"last_used_at"`
	LastUsedIP string          `json:"last_used_ip"`
	LastSeenIn string          `json:"last_used_location"`
	Credential json.RawMessage `json:"-"`
}

// Where a passkey was born, or where it was last used. Both are best-effort:
// an empty string just means nothing was learned.
type Origin struct {
	Device    string
	UserAgent string
	IP        string
	Location  string
}

const passkeyCols = `id, name, device, user_agent, location, ip, created_at,
	last_used_at, last_used_ip, last_used_location, credential`

func scanPasskey(row interface{ Scan(...any) error }) (Passkey, error) {
	var p Passkey
	err := row.Scan(&p.ID, &p.Name, &p.Device, &p.UserAgent, &p.Location, &p.IP,
		&p.CreatedAt, &p.LastUsedAt, &p.LastUsedIP, &p.LastSeenIn, &p.Credential)
	return p, err
}

func (s *Store) Passkeys(ctx context.Context, userID int64) ([]Passkey, error) {
	rows, err := s.pool.Query(ctx, `select `+passkeyCols+`
		  from webauthn_credentials where user_id = $1
		 order by created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Passkey{}
	for rows.Next() {
		p, err := scanPasskey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) CountPasskeys(ctx context.Context, userID int64) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`select count(*) from webauthn_credentials where user_id = $1`, userID).Scan(&n)
	return n, err
}

func (s *Store) AddPasskey(ctx context.Context, userID int64, credentialID []byte, credential json.RawMessage, name string, from Origin) (Passkey, error) {
	p, err := scanPasskey(s.pool.QueryRow(ctx, `
		insert into webauthn_credentials
		       (user_id, credential_id, credential, name, device, user_agent, ip, location)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
		returning `+passkeyCols,
		userID, credentialID, credential, name,
		from.Device, from.UserAgent, from.IP, from.Location))
	return p, norm(err)
}

// TouchPasskey records the sign counter the authenticator reported, which is
// how a cloned authenticator would give itself away.
func (s *Store) TouchPasskey(ctx context.Context, credentialID []byte, credential json.RawMessage, from Origin) error {
	// Keys registered before any of this was recorded learn who they are the
	// first time they are used — but only from a device that holds the key
	// itself, never from a laptop borrowing a phone's passkey over the QR.
	_, err := s.pool.Exec(ctx, `
		update webauthn_credentials
		   set credential = $2, last_used_at = now(),
		       last_used_ip = $3, last_used_location = $4,
		       device     = case when device = ''     and $5 <> '' then $5 else device end,
		       user_agent = case when user_agent = '' and $5 <> '' then $6 else user_agent end,
		       ip         = case when ip = ''                      then $3 else ip end,
		       location   = case when location = ''                then $4 else location end
		 where credential_id = $1`,
		credentialID, credential, from.IP, from.Location, from.Device, from.UserAgent)
	return err
}

func (s *Store) RenamePasskey(ctx context.Context, userID, id int64, name string) (Passkey, error) {
	p, err := scanPasskey(s.pool.QueryRow(ctx, `
		update webauthn_credentials set name = $3
		 where id = $1 and user_id = $2
		 returning `+passkeyCols, id, userID, name))
	return p, norm(err)
}

func (s *Store) DeletePasskey(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx,
		`delete from webauthn_credentials where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ClearPasskeys is the way back in when every registered device is gone. Only
// the CLI calls it.
func (s *Store) ClearPasskeys(ctx context.Context, email string) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		delete from webauthn_credentials
		 where user_id in (select id from users where email = $1)`, email)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// CreateEnrolToken issues a one-shot invitation to register a passkey. It dies
// after its window closes or after one use, whichever comes first.
func (s *Store) CreateEnrolToken(ctx context.Context, userID int64, nonce []byte, expires time.Time) error {
	// Expired invitations are worthless; sweep them on the way past.
	if _, err := s.pool.Exec(ctx, `delete from enrol_tokens where expires_at < now()`); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx,
		`insert into enrol_tokens (user_id, nonce, expires_at) values ($1, $2, $3)`,
		userID, nonce, expires)
	return err
}

func (s *Store) EnrolTokenUser(ctx context.Context, nonce []byte) (User, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		select user_id from enrol_tokens
		 where nonce = $1 and used_at is null and expires_at > now()`, nonce).Scan(&id)
	if err != nil {
		return User{}, norm(err)
	}
	return s.UserByID(ctx, id)
}

// UseEnrolToken burns the invitation. The update itself is the guard: two
// devices racing on one link means exactly one of them wins.
func (s *Store) UseEnrolToken(ctx context.Context, nonce []byte) error {
	tag, err := s.pool.Exec(ctx, `
		update enrol_tokens set used_at = now()
		 where nonce = $1 and used_at is null and expires_at > now()`, nonce)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
