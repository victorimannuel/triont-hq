package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListSetlists(w http.ResponseWriter, r *http.Request) {
	lists, err := s.store.ListSetlists(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"setlists": lists})
}

// handleGetSetlist hands back the evening and every song in it, in full. The
// play view switches on a tap and must not go to the server for each one.
func (s *Server) handleGetSetlist(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	list, err := s.store.SetlistByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	songs, err := s.store.SetlistSongs(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"setlist": list, "songs": songs})
}

func (s *Server) readSetlist(r *http.Request) (store.SetlistInput, string) {
	var in store.SetlistInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama setlist wajib diisi"
	}
	in.Notes = trim(in.Notes)
	in.PlaysOn = trim(in.PlaysOn)
	if in.PlaysOn != "" {
		if _, err := time.Parse("2006-01-02", in.PlaysOn); err != nil {
			return in, "tanggal harus format YYYY-MM-DD"
		}
	}
	return in, ""
}

func (s *Server) handleCreateSetlist(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readSetlist(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	list, err := s.store.CreateSetlist(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, list)
}

func (s *Server) handleUpdateSetlist(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readSetlist(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	list, err := s.store.UpdateSetlist(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleDeleteSetlist(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteSetlist(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleAddSetlistSong(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		SongID int64 `json:"song_id"`
	}
	if err := readJSON(r, &in); err != nil || in.SongID == 0 {
		fail(w, http.StatusBadRequest, "lagunya nggak kebaca")
		return
	}
	rowID, err := s.store.AddSetlistSong(r.Context(), id, in.SongID)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": rowID})
}

func (s *Server) handleRemoveSetlistSong(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.RemoveSetlistSong(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleSetSetlistSongSteps records what key tonight wants. Bounded to two
// octaves either way: past that it is a typo, not a transpose.
func (s *Server) handleSetSetlistSongSteps(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		Steps int `json:"steps"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	if in.Steps < -24 || in.Steps > 24 {
		fail(w, http.StatusBadRequest, "geserannya kejauhan")
		return
	}
	if err := s.store.SetSetlistSongSteps(r.Context(), id, in.Steps); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReorderSetlist takes the running order whole. The client already knows
// what it wants the list to look like, and sending that cannot half-apply the
// way a sequence of swaps can.
func (s *Server) handleReorderSetlist(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		IDs []int64 `json:"ids"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "urutannya nggak kebaca")
		return
	}
	if err := s.store.ReorderSetlist(r.Context(), id, in.IDs); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
