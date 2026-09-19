package api

import (
	"net/http"

	"github.com/victorimannuel/triont-hq/internal/store"
)

func (s *Server) handleListTracker(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tasks, err := s.store.ListTrackerTasks(r.Context(), store.TrackerFilter{
		Status:  q.Get("status"),
		Owner:   q.Get("owner"),
		Project: q.Get("project"),
		Company: q.Get("company"),
		Query:   q.Get("q"),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}

func (s *Server) handleGetTracker(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	task, err := s.store.TrackerTaskByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) readTracker(r *http.Request) (store.TrackerInput, string) {
	var in store.TrackerInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Task = trim(in.Task)
	if in.Task == "" {
		return in, "tugasnya wajib diisi"
	}
	in.Area = trim(in.Area)
	in.NextStep = trim(in.NextStep)
	in.Comment = trim(in.Comment)
	in.Priority = valid(trackerPriorities, in.Priority, "normal")
	in.Project = valid(trackerProjects, in.Project, "general")
	in.Owner = valid(trackerOwners, in.Owner, "unassigned")
	in.Status = valid(trackerStatuses, in.Status, "todo")
	// Company is a slug from the tracker_companies table, which is edited from the
	// app, so it is taken as sent rather than checked against a fixed list. Blank
	// is fine: not every task belongs to one.
	in.Company = trim(in.Company)
	return in, ""
}

func (s *Server) handleCreateTracker(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readTracker(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	task, err := s.store.CreateTrackerTask(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

func (s *Server) handleUpdateTracker(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readTracker(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	task, err := s.store.UpdateTrackerTask(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleDeleteTracker(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteTrackerTask(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
