// Package api exposes the whole application as JSON over HTTP. The React
// bundle is a client of this API and nothing more, so a phone app added later
// talks to exactly the same endpoints.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/victorimannuel/triont-hq/internal/config"
	"github.com/victorimannuel/triont-hq/internal/secret"
	"github.com/victorimannuel/triont-hq/internal/store"
)

const cookieName = "hq_session"

type ctxKey string

const userKey ctxKey = "user"

type Server struct {
	cfg   config.Config
	store *store.Store
	box   *secret.Box
	log   *slog.Logger
	wa    *webauthn.WebAuthn
}

func New(cfg config.Config, st *store.Store, box *secret.Box, log *slog.Logger) (*Server, error) {
	wa, err := webauthn.New(&webauthn.Config{
		RPDisplayName: "HQ",
		RPID:          cfg.RPID,
		RPOrigins:     []string{cfg.Origin},
	})
	if err != nil {
		return nil, err
	}
	return &Server{cfg: cfg, store: st, box: box, log: log, wa: wa}, nil
}

// Routes returns only the /api surface. Serving the front-end is the caller's
// job, which keeps this package free of any opinion about the UI.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.Handle("GET /api/auth/me", s.requireAuth(s.handleMe))
	mux.HandleFunc("GET /api/meta", s.handleMeta)
	mux.HandleFunc("GET /api/health", s.handleHealth)

	mux.Handle("GET /api/overview", s.requireAuth(s.handleOverview))

	mux.Handle("GET /api/projects", s.requireAuth(s.handleListProjects))
	mux.Handle("POST /api/projects", s.requireAuth(s.handleCreateProject))
	mux.Handle("GET /api/projects/{slug}", s.requireAuth(s.handleGetProject))
	mux.Handle("PUT /api/projects/{slug}", s.requireAuth(s.handleUpdateProject))
	mux.Handle("DELETE /api/projects/{slug}", s.requireAuth(s.handleDeleteProject))
	mux.Handle("POST /api/projects/{slug}/links", s.requireAuth(s.handleCreateLink))
	mux.Handle("PUT /api/links/{id}", s.requireAuth(s.handleUpdateLink))
	mux.Handle("DELETE /api/links/{id}", s.requireAuth(s.handleDeleteLink))

	mux.Handle("GET /api/credentials", s.requireAuth(s.handleListCredentials))
	mux.Handle("POST /api/credentials", s.requireAuth(s.handleCreateCredential))
	mux.Handle("PUT /api/credentials/{id}", s.requireAuth(s.handleUpdateCredential))
	mux.Handle("DELETE /api/credentials/{id}", s.requireAuth(s.handleDeleteCredential))
	mux.Handle("POST /api/credentials/{id}/reveal", s.requireAuth(s.handleReveal))

	mux.HandleFunc("POST /api/auth/passkey/login/begin", s.handlePasskeyLoginBegin)
	mux.HandleFunc("POST /api/auth/passkey/login/finish", s.handlePasskeyLoginFinish)
	mux.Handle("GET /api/auth/passkeys", s.requireAuth(s.handleListPasskeys))
	mux.Handle("POST /api/auth/passkeys/begin", s.requireAuth(s.handlePasskeyRegisterBegin))
	mux.Handle("POST /api/auth/passkeys/finish", s.requireAuth(s.handlePasskeyRegisterFinish))
	mux.Handle("PUT /api/auth/passkeys/{id}", s.requireAuth(s.handleRenamePasskey))
	mux.Handle("DELETE /api/auth/passkeys/{id}", s.requireAuth(s.handleDeletePasskey))
	mux.Handle("POST /api/auth/stepup/begin", s.requireAuth(s.handleStepUpBegin))
	mux.Handle("POST /api/auth/stepup/finish", s.requireAuth(s.handleStepUpFinish))
	mux.Handle("POST /api/auth/passkeys/link", s.requireAuth(s.handleCreateEnrolLink))
	mux.HandleFunc("POST /api/auth/enrol/begin", s.handleEnrolBegin)
	mux.HandleFunc("POST /api/auth/enrol/finish", s.handleEnrolFinish)

	mux.Handle("GET /api/search", s.requireAuth(s.handleSearch))

	mux.Handle("GET /api/fx", s.requireAuth(s.handleRates))
	mux.Handle("POST /api/fx/refresh", s.requireAuth(s.handleRefreshRates))

	mux.Handle("GET /api/expenses", s.requireAuth(s.handleListExpenses))
	mux.Handle("POST /api/expenses", s.requireAuth(s.handleCreateExpense))
	mux.Handle("GET /api/expenses/{id}", s.requireAuth(s.handleGetExpense))
	mux.Handle("PUT /api/expenses/{id}", s.requireAuth(s.handleUpdateExpense))
	mux.Handle("DELETE /api/expenses/{id}", s.requireAuth(s.handleDeleteExpense))

	mux.Handle("GET /api/income", s.requireAuth(s.handleListIncome))
	mux.Handle("POST /api/income", s.requireAuth(s.handleCreateIncome))
	mux.Handle("GET /api/income/{id}", s.requireAuth(s.handleGetIncome))
	mux.Handle("PUT /api/income/{id}", s.requireAuth(s.handleUpdateIncome))
	mux.Handle("DELETE /api/income/{id}", s.requireAuth(s.handleDeleteIncome))

	mux.Handle("GET /api/calendar", s.requireAuth(s.handleCalendar))

	mux.Handle("GET /api/belongings", s.requireAuth(s.handleListBelongings))
	mux.Handle("POST /api/belongings", s.requireAuth(s.handleCreateBelonging))
	mux.Handle("GET /api/belongings/{id}", s.requireAuth(s.handleGetBelonging))
	mux.Handle("PUT /api/belongings/{id}", s.requireAuth(s.handleUpdateBelonging))
	mux.Handle("DELETE /api/belongings/{id}", s.requireAuth(s.handleDeleteBelonging))
	mux.Handle("POST /api/belongings/{id}/maintenance", s.requireAuth(s.handleCreateMaintenance))
	mux.Handle("DELETE /api/maintenance/{id}", s.requireAuth(s.handleDeleteMaintenance))

	mux.Handle("GET /api/people", s.requireAuth(s.handleListPeople))
	mux.Handle("POST /api/people", s.requireAuth(s.handleCreatePerson))
	mux.Handle("GET /api/people/{id}", s.requireAuth(s.handleGetPerson))
	mux.Handle("PUT /api/people/{id}", s.requireAuth(s.handleUpdatePerson))
	mux.Handle("DELETE /api/people/{id}", s.requireAuth(s.handleDeletePerson))
	mux.Handle("POST /api/people/{id}/touch", s.requireAuth(s.handleTouchPerson))

	mux.Handle("GET /api/documents", s.requireAuth(s.handleListDocuments))
	mux.Handle("POST /api/documents", s.requireAuth(s.handleCreateDocument))
	mux.Handle("GET /api/documents/{id}", s.requireAuth(s.handleGetDocument))
	mux.Handle("PUT /api/documents/{id}", s.requireAuth(s.handleUpdateDocument))
	mux.Handle("DELETE /api/documents/{id}", s.requireAuth(s.handleDeleteDocument))
	mux.Handle("POST /api/documents/{id}/reveal", s.requireAuth(s.handleRevealDocument))

	mux.Handle("GET /api/tags", s.requireAuth(s.handleListTags))
	mux.Handle("DELETE /api/tags/{id}", s.requireAuth(s.handleDeleteTag))
	mux.Handle("POST /api/projects/{slug}/tags", s.requireAuth(s.handleTagProject))
	mux.Handle("DELETE /api/projects/{slug}/tags/{id}", s.requireAuth(s.handleUntagProject))

	mux.Handle("GET /api/trash", s.requireAuth(s.handleTrash))
	mux.Handle("POST /api/trash/{entity}/{id}/restore", s.requireAuth(s.handleRestore))
	mux.Handle("DELETE /api/trash/{entity}/{id}", s.requireAuth(s.handlePurge))

	mux.Handle("GET /api/clients", s.requireAuth(s.handleListClients))
	mux.Handle("POST /api/clients", s.requireAuth(s.handleCreateClient))
	mux.Handle("GET /api/clients/{slug}", s.requireAuth(s.handleGetClient))
	mux.Handle("PUT /api/clients/{slug}", s.requireAuth(s.handleUpdateClient))
	mux.Handle("DELETE /api/clients/{slug}", s.requireAuth(s.handleDeleteClient))
	mux.Handle("POST /api/clients/{slug}/contacts", s.requireAuth(s.handleCreateContact))
	mux.Handle("PUT /api/contacts/{id}", s.requireAuth(s.handleUpdateContact))
	mux.Handle("DELETE /api/contacts/{id}", s.requireAuth(s.handleDeleteContact))

	mux.Handle("GET /api/assets", s.requireAuth(s.handleListAssets))
	mux.Handle("POST /api/assets", s.requireAuth(s.handleCreateAsset))
	mux.Handle("GET /api/assets/{id}", s.requireAuth(s.handleGetAsset))
	mux.Handle("PUT /api/assets/{id}", s.requireAuth(s.handleUpdateAsset))
	mux.Handle("DELETE /api/assets/{id}", s.requireAuth(s.handleDeleteAsset))
	mux.Handle("POST /api/projects/{slug}/assets", s.requireAuth(s.handleAttachAsset))
	mux.Handle("DELETE /api/projects/{slug}/assets/{id}", s.requireAuth(s.handleDetachAsset))

	return mux
}

func (s *Server) requireAuth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			if c, err := r.Cookie(cookieName); err == nil {
				token = c.Value
			}
		}
		userID, err := parseToken(s.cfg.SessionKey, token, time.Now())
		if err != nil {
			fail(w, http.StatusUnauthorized, "belum masuk")
			return
		}
		user, err := s.store.UserByID(r.Context(), userID)
		if err != nil {
			fail(w, http.StatusUnauthorized, "belum masuk")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, user)))
	})
}

// actor is who gets written into the created_by / updated_by columns. It can
// only be reached from a handler behind requireAuth, so it is never empty in
// practice.
func actor(r *http.Request) string {
	user, _ := r.Context().Value(userKey).(store.User)
	return user.Email
}

func bearer(r *http.Request) string {
	const p = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) > len(p) && h[:len(p)] == p {
		return h[len(p):]
	}
	return ""
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleMeta feeds the front-end its dropdowns so the allowed values live in
// exactly one place.
func (s *Server) handleMeta(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"statuses":           statuses,
		"kinds":              kinds,
		"link_categories":    linkCategories,
		"credential_kinds":   credentialKinds,
		"asset_kinds":        assetKinds,
		"asset_statuses":     assetStatuses,
		"billing_cycles":     billingCycles,
		"currencies":         currencies,
		"client_statuses":    clientStatuses,
		"client_kinds":       clientKinds,
		"ownerships":         ownerships,
		"conditions":         conditions,
		"income_statuses":    incomeStatuses,
		"expense_categories": expenseCategories,
		"document_kinds":     documentKinds,
		"belonging_kinds":    belongingKinds,
		"belonging_statuses": belongingStatuses,
		"maintenance_kinds":  maintenanceKinds,
	})
}

func (s *Server) handleOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := s.store.Overview(r.Context())
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func fail(w http.ResponseWriter, code int, message string) {
	writeJSON(w, code, map[string]string{"error": message})
}

// oops keeps the real error in the log and gives the client nothing to learn
// from, which matters on an app whose whole point is holding secrets.
func (s *Server) oops(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		fail(w, http.StatusNotFound, "nggak ketemu")
		return
	}
	s.log.Error("request failed", "err", err)
	fail(w, http.StatusInternalServerError, "ada yang salah di server")
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func pathID(r *http.Request, name string) (int64, error) {
	return strconv.ParseInt(r.PathValue(name), 10, 64)
}
