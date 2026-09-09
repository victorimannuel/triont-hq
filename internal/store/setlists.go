package store

import (
	"context"
	"time"
)

/*
An evening's worth of songs, in order. The order is the whole point, so it is
stored rather than derived, and each place in the list carries its own
transpose: the song keeps the key it was written in, and the setlist says how
far tonight wants it moved.
*/

type Setlist struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	PlaysOn   *time.Time `json:"plays_on"`
	Notes     string     `json:"notes"`
	SongCount int        `json:"song_count"`
	CreatedBy string     `json:"created_by"`
	UpdatedBy string     `json:"updated_by"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// SetlistSong is one place in the running order: the whole song, plus what
// this evening does to it.
type SetlistSong struct {
	// The row's own id, not the song's. Moving and removing address this,
	// because the same song may appear twice.
	ID    int64 `json:"id"`
	Song  Song  `json:"song"`
	Steps int   `json:"steps"`
}

type SetlistInput struct {
	Name    string `json:"name"`
	PlaysOn string `json:"plays_on"`
	Notes   string `json:"notes"`
}

const setlistCols = `id, name, plays_on, notes,
	created_by, updated_by, created_at, updated_at`

func scanSetlist(row interface{ Scan(...any) error }) (Setlist, error) {
	var s Setlist
	err := row.Scan(&s.ID, &s.Name, &s.PlaysOn, &s.Notes,
		&s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

// ListSetlists puts the most recent evening first: a setlist is looked up
// either just before it is played or just after, and both are near the top.
func (s *Store) ListSetlists(ctx context.Context) ([]Setlist, error) {
	rows, err := s.pool.Query(ctx, `
		select `+setlistCols+`,
		       (select count(*) from setlist_songs x
		             where x.setlist_id = setlists.id and x.deleted_at is null)
		  from setlists
		 where deleted_at is null
		 order by plays_on desc nulls last, lower(name)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Setlist{}
	for rows.Next() {
		var item Setlist
		if err := rows.Scan(&item.ID, &item.Name, &item.PlaysOn, &item.Notes,
			&item.CreatedBy, &item.UpdatedBy, &item.CreatedAt, &item.UpdatedAt,
			&item.SongCount); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) SetlistByID(ctx context.Context, id int64) (Setlist, error) {
	list, err := scanSetlist(s.pool.QueryRow(ctx,
		`select `+setlistCols+` from setlists where id = $1 and deleted_at is null`, id))
	if err != nil {
		return list, norm(err)
	}
	err = s.pool.QueryRow(ctx,
		`select count(*) from setlist_songs
		  where setlist_id = $1 and deleted_at is null`, id).Scan(&list.SongCount)
	return list, err
}

// SetlistSongs is the running order, with every song in full: the play view
// switches between them on a tap and must not go back to the server for each.
func (s *Store) SetlistSongs(ctx context.Context, id int64) ([]SetlistSong, error) {
	rows, err := s.pool.Query(ctx, `
		select x.id, x.steps,
		       g.id, g.title, g.artist, g.song_key, g.tempo, g.part, g.body, g.notes,
		       g.created_by, g.updated_by, g.created_at, g.updated_at
		  from setlist_songs x
		  join songs g on g.id = x.song_id and g.deleted_at is null
		 where x.setlist_id = $1 and x.deleted_at is null
		 order by x.position, x.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []SetlistSong{}
	for rows.Next() {
		var item SetlistSong
		var g Song
		if err := rows.Scan(&item.ID, &item.Steps,
			&g.ID, &g.Title, &g.Artist, &g.Key, &g.Tempo, &g.Part, &g.Body, &g.Notes,
			&g.CreatedBy, &g.UpdatedBy, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		item.Song = g
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) CreateSetlist(ctx context.Context, in SetlistInput, actor string) (Setlist, error) {
	plays, err := parseDate(in.PlaysOn)
	if err != nil {
		return Setlist{}, err
	}
	list, err := scanSetlist(s.pool.QueryRow(ctx, `
		insert into setlists (name, plays_on, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $4)
		returning `+setlistCols, in.Name, plays, in.Notes, actor))
	return list, norm(err)
}

func (s *Store) UpdateSetlist(ctx context.Context, id int64, in SetlistInput, actor string) (Setlist, error) {
	plays, err := parseDate(in.PlaysOn)
	if err != nil {
		return Setlist{}, err
	}
	list, err := scanSetlist(s.pool.QueryRow(ctx, `
		update setlists set name = $1, plays_on = $2, notes = $3,
		       updated_by = $4, updated_at = now()
		 where id = $5 and deleted_at is null
		returning `+setlistCols, in.Name, plays, in.Notes, actor, id))
	return list, norm(err)
}

func (s *Store) DeleteSetlist(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "setlists", id, actor)
}

func (s *Store) RestoreSetlist(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "setlists", id, actor)
}

// AddSetlistSong puts a song at the end of the evening, which is where one
// gets added: you build a running order forwards and then shuffle it.
func (s *Store) AddSetlistSong(ctx context.Context, setlistID, songID int64) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		insert into setlist_songs (setlist_id, song_id, position)
		values ($1, $2, coalesce(
		    (select max(position) + 1 from setlist_songs
		     where setlist_id = $1 and deleted_at is null), 0))
		returning id`, setlistID, songID).Scan(&id)
	return id, norm(err)
}

func (s *Store) RemoveSetlistSong(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "setlist_songs", id, actor)
}

// SetSetlistSongSteps is what "tonight in Bb" writes down.
func (s *Store) SetSetlistSongSteps(ctx context.Context, id int64, steps int) error {
	tag, err := s.pool.Exec(ctx,
		`update setlist_songs set steps = $2
		  where id = $1 and deleted_at is null`, id, steps)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

/*
ReorderSetlist takes the whole running order at once rather than a pair to
swap. Moving one song by hand is two writes and a chance to end up with two
songs in the same place; the client already knows the order it wants, and
sending that is both simpler and impossible to half-apply.

Rows not named are left where they are, which is what happens when a song was
removed in another tab while this one was being dragged about.
*/
func (s *Store) ReorderSetlist(ctx context.Context, setlistID int64, ids []int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for position, id := range ids {
		if _, err := tx.Exec(ctx, `
			update setlist_songs set position = $3
			 where id = $1 and setlist_id = $2 and deleted_at is null`, id, setlistID, position); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) RestoreSetlistSong(ctx context.Context, id int64) error {
	return s.restoreBare(ctx, "setlist_songs", "id", id)
}
