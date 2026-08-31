package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// Proving, mid-session, that the person at the keyboard still holds a
// registered device. An open session is not enough for the things that can
// weaken the account itself: handing out an enrolment link, or removing a
// device. One check buys one action.

func (s *Server) handleStepUpBegin(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}
	if len(wu.creds) == 0 {
		fail(w, http.StatusBadRequest, "belum ada perangkat buat verifikasi")
		return
	}

	options, session, err := s.wa.BeginLogin(wu,
		webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		s.log.Error("stepup begin", "err", err)
		fail(w, http.StatusInternalServerError, "gagal mulai verifikasi")
		return
	}
	if err := s.setCeremony(w, session); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, options)
}

func (s *Server) handleStepUpFinish(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	session, err := s.readCeremony(r)
	if err != nil {
		fail(w, http.StatusBadRequest, "sesi verifikasi habis, ulangi")
		return
	}
	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}

	credential, err := s.wa.FinishLogin(wu, *session, r)
	if err != nil {
		s.log.Error("stepup finish", "err", err)
		fail(w, http.StatusUnauthorized, "verifikasi gagal")
		return
	}
	if credential.Authenticator.CloneWarning {
		s.log.Error("passkey clone warning", "user", user.Email)
		fail(w, http.StatusUnauthorized, "verifikasi ditolak")
		return
	}
	if raw, err := json.Marshal(credential); err == nil {
		_ = s.store.TouchPasskey(r.Context(), credential.ID, raw, s.origin(r))
	}

	s.clearCeremony(w)
	http.SetCookie(w, &http.Cookie{
		Name:     freshCookie,
		Value:    signToken(s.cfg.SessionKey, user.ID, time.Now().Add(freshTTL)),
		Path:     "/",
		Expires:  time.Now().Add(freshTTL),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) freshlyVerified(r *http.Request, user store.User) bool {
	c, err := r.Cookie(freshCookie)
	if err != nil {
		return false
	}
	id, err := parseToken(s.cfg.SessionKey, c.Value, time.Now())
	return err == nil && id == user.ID
}

func (s *Server) clearFresh(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: freshCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.cfg.SecureCookie, SameSite: http.SameSiteStrictMode,
	})
}
