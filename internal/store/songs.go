package store

import (
	"context"
	"strings"
	"time"
)

/*
A chord chart, kept the way it was typed. Nothing here parses or tidies the
body: which column a chord sits in says which syllable it lands on, and a
server that reformatted it would quietly destroy the one thing the chart is
for. Transposing is done on the way to the screen, so what is stored stays in
the key it was written in and stays true.
*/

type Song struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
	// The key the body below is written in.
	Key   string `json:"key"`
	Tempo int    `json:"tempo"`
	// Who reads it on the night: "bass", "piano", or empty for both.
	Part      string    `json:"part"`
	Body      string    `json:"body"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SongInput struct {
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Key    string `json:"key"`
	Tempo  int    `json:"tempo"`
	Part   string `json:"part"`
	Body   string `json:"body"`
	Notes  string `json:"notes"`
}

type SongFilter struct {
	Query string
	Part  string
}

const songCols = `id, title, artist, song_key, tempo, part, body, notes,
	created_by, updated_by, created_at, updated_at`

func scanSong(row interface{ Scan(...any) error }) (Song, error) {
	var s Song
	err := row.Scan(&s.ID, &s.Title, &s.Artist, &s.Key, &s.Tempo, &s.Part,
		&s.Body, &s.Notes, &s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (s *Store) ListSongs(ctx context.Context, f SongFilter) ([]Song, error) {
	rows, err := s.pool.Query(ctx, `select `+songCols+`
		  from songs
		 where deleted_at is null
		   and ($1 = '' or title ilike '%' || $1 || '%'
		                or artist ilike '%' || $1 || '%'
		                or body ilike '%' || $1 || '%')
		   -- A chart with no part on it suits whoever picks it up, so it
		   -- belongs in both filtered lists rather than in neither.
		   and ($2 = '' or part = $2 or part = '')
		 order by lower(title)`,
		strings.TrimSpace(f.Query), f.Part)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Song{}
	for rows.Next() {
		song, err := scanSong(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, song)
	}
	return out, rows.Err()
}

func (s *Store) SongByID(ctx context.Context, id int64) (Song, error) {
	song, err := scanSong(s.pool.QueryRow(ctx,
		`select `+songCols+` from songs where id = $1 and deleted_at is null`, id))
	return song, norm(err)
}

func (s *Store) CreateSong(ctx context.Context, in SongInput, actor string) (Song, error) {
	song, err := scanSong(s.pool.QueryRow(ctx, `
		insert into songs (title, artist, song_key, tempo, part, body, notes,
		                   created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
		returning `+songCols,
		in.Title, in.Artist, in.Key, in.Tempo, in.Part, in.Body, in.Notes, actor))
	return song, norm(err)
}

func (s *Store) UpdateSong(ctx context.Context, id int64, in SongInput, actor string) (Song, error) {
	song, err := scanSong(s.pool.QueryRow(ctx, `
		update songs set title = $1, artist = $2, song_key = $3, tempo = $4,
		       part = $5, body = $6, notes = $7,
		       updated_by = $8, updated_at = now()
		 where id = $9 and deleted_at is null
		returning `+songCols,
		in.Title, in.Artist, in.Key, in.Tempo, in.Part, in.Body, in.Notes, actor, id))
	return song, norm(err)
}

func (s *Store) DeleteSong(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "songs", id, actor)
}

func (s *Store) RestoreSong(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "songs", id, actor)
}
