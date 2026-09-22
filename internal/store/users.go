package store

import (
	"context"
	"encoding/json"
	"strings"
)

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`select id, email, password_hash, created_at from users where email = $1`,
		strings.ToLower(strings.TrimSpace(email)),
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	return u, norm(err)
}

func (s *Store) UserByID(ctx context.Context, id int64) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`select id, email, password_hash, created_at from users where id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	return u, norm(err)
}

func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `select count(*) from users`).Scan(&n)
	return n, err
}

// NavFavorites is the account's starred nav destinations, an ordered list of nav
// keys. Kept as JSON in a text column: a short list read and written whole, where
// a table of its own would be more machinery than it earns.
func (s *Store) NavFavorites(ctx context.Context, userID int64) ([]string, error) {
	var raw string
	if err := s.pool.QueryRow(ctx,
		`select nav_favorites from users where id = $1`, userID).Scan(&raw); err != nil {
		return nil, norm(err)
	}
	if strings.TrimSpace(raw) == "" {
		return []string{}, nil
	}
	var keys []string
	if err := json.Unmarshal([]byte(raw), &keys); err != nil {
		// A value that will not parse is treated as none, not an error: this is a
		// convenience, not a record worth failing a page load over.
		return []string{}, nil
	}
	return keys, nil
}

// SetNavFavorites replaces the whole list, since that is how it is toggled: the
// client sends the list it wants after each star.
func (s *Store) SetNavFavorites(ctx context.Context, userID int64, keys []string) error {
	if keys == nil {
		keys = []string{}
	}
	raw, err := json.Marshal(keys)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`update users set nav_favorites = $1 where id = $2`, string(raw), userID)
	return err
}

// SetPasswordHash replaces the password of an account that already exists. The
// caller has checked the old one; this only stores the new.
func (s *Store) SetPasswordHash(ctx context.Context, userID int64, hash string) error {
	_, err := s.pool.Exec(ctx,
		`update users set password_hash = $1 where id = $2`, hash, userID)
	return err
}

// UpsertUser creates the account or resets its password. Used by the boot-time
// owner bootstrap and by the `hq passwd` subcommand.
func (s *Store) UpsertUser(ctx context.Context, email, passwordHash string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		insert into users (email, password_hash) values ($1, $2)
		on conflict (email) do update set password_hash = excluded.password_hash
		returning id, email, password_hash, created_at`,
		strings.ToLower(strings.TrimSpace(email)), passwordHash,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	return u, norm(err)
}
