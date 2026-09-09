package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListSongs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	songs, err := s.store.ListSongs(r.Context(), store.SongFilter{
		Query: q.Get("q"),
		Part:  valid(songParts, q.Get("part"), ""),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"songs": songs})
}

func (s *Server) handleGetSong(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	song, err := s.store.SongByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, song)
}

// The body is the one field that is taken exactly as it arrives. Trimming it
// would move every chord one column left on the first line, which is the sort
// of tidiness that ruins a chart.
func (s *Server) readSong(r *http.Request) (store.SongInput, string) {
	var in store.SongInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Title = trim(in.Title)
	if in.Title == "" {
		return in, "judul lagu wajib diisi"
	}
	in.Artist = trim(in.Artist)
	in.Key = trim(in.Key)
	in.Notes = trim(in.Notes)
	in.Part = valid(songParts, in.Part, "")
	if in.Tempo < 0 || in.Tempo > 400 {
		return in, "tempo di luar akal"
	}
	return in, ""
}

func (s *Server) handleCreateSong(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readSong(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	song, err := s.store.CreateSong(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, song)
}

func (s *Server) handleUpdateSong(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readSong(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	song, err := s.store.UpdateSong(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, song)
}

func (s *Server) handleDeleteSong(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteSong(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
