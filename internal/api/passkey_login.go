package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// The second half of signing in. The password hands out a half session that
// opens nothing; this turns it into a real one, and only a registered device
// can do that.

func (s *Server) handlePasskeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	user, err := s.halfSessionUser(r)
	if err != nil {
		fail(w, http.StatusUnauthorized, "masuk dulu pakai password")
		return
	}
	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}

	options, session, err := s.wa.BeginLogin(wu,
		webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		s.log.Error("passkey login begin", "err", err)
		fail(w, http.StatusInternalServerError, "gagal mulai verifikasi")
		return
	}
	if err := s.setCeremony(w, session); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, options)
}

func (s *Server) handlePasskeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	user, err := s.halfSessionUser(r)
	if err != nil {
		fail(w, http.StatusUnauthorized, "masuk dulu pakai password")
		return
	}
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
		s.log.Error("passkey login finish", "err", err)
		fail(w, http.StatusUnauthorized, "verifikasi gagal")
		return
	}
	// A counter that went backwards means the authenticator was cloned.
	if credential.Authenticator.CloneWarning {
		s.log.Error("passkey clone warning", "user", user.Email)
		fail(w, http.StatusUnauthorized, "verifikasi ditolak")
		return
	}

	if raw, err := json.Marshal(credential); err == nil {
		_ = s.store.TouchPasskey(r.Context(), credential.ID, raw, s.origin(r))
	}

	s.clearCeremony(w)
	s.clearHalfSession(w)
	s.issueSession(w, user)
	writeJSON(w, http.StatusOK, map[string]any{"email": user.Email})
}
