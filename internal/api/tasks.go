package api

import (
	"net/http"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// Both lists run through these handlers; which one is being read comes off the
// query string. An unrecognised kind is refused rather than defaulted, because
// a typo would otherwise file a shopping item quietly under to-dos.
func taskKind(r *http.Request) (string, bool) {
	switch r.URL.Query().Get("kind") {
	case store.TaskTodo:
		return store.TaskTodo, true
	case store.TaskBuy:
		return store.TaskBuy, true
	}
	return "", false
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	kind, ok := taskKind(r)
	if !ok {
		fail(w, http.StatusBadRequest, "jenis daftar nggak dikenal")
		return
	}
	tasks, err := s.store.Tasks(r.Context(), kind)
	if err != nil {
		s.oops(w, err)
		return
	}

	open := 0
	for _, task := range tasks {
		if task.DoneAt == nil {
			open++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks, "open": open})
}

// readTask takes the one line that was typed and the date that may or may not
// go with it. A deadline belongs to a to-do only: a shopping list is read
// standing in a shop, and a date on it would be one more thing to fill in for
// no gain.
func (s *Server) readTask(r *http.Request, kind string) (store.TaskInput, string) {
	var in store.TaskInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Title = trim(in.Title)
	if in.Title == "" {
		return in, "isinya wajib diisi"
	}
	in.DueOn = trim(in.DueOn)
	if kind != store.TaskTodo {
		in.DueOn = ""
	}
	if in.DueOn != "" {
		if _, err := time.Parse("2006-01-02", in.DueOn); err != nil {
			return in, "tanggal harus format YYYY-MM-DD"
		}
	}
	return in, ""
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	kind, ok := taskKind(r)
	if !ok {
		fail(w, http.StatusBadRequest, "jenis daftar nggak dikenal")
		return
	}
	in, msg := s.readTask(r, kind)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	task, err := s.store.CreateTask(r.Context(), kind, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

func (s *Server) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	kind, ok := taskKind(r)
	if !ok {
		fail(w, http.StatusBadRequest, "jenis daftar nggak dikenal")
		return
	}
	in, msg := s.readTask(r, kind)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	task, err := s.store.UpdateTask(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

// handleSetTaskDone is the whole point of the module: one tap, and it goes
// quiet. It unticks too, so a mis-tap costs another tap rather than retyping.
func (s *Server) handleSetTaskDone(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in struct {
		Done bool `json:"done"`
	}
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	task, err := s.store.SetTaskDone(r.Context(), id, in.Done, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteTask(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleClearDoneTasks(w http.ResponseWriter, r *http.Request) {
	kind, ok := taskKind(r)
	if !ok {
		fail(w, http.StatusBadRequest, "jenis daftar nggak dikenal")
		return
	}
	cleared, err := s.store.ClearDoneTasks(r.Context(), kind)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cleared": cleared})
}
