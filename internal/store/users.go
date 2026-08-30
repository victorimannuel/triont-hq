package store

import (
	"context"
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
