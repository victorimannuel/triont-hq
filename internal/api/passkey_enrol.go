package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// Enrolling a device that is nowhere near the one holding the session. The
// browser's cross-device QR needs the two within Bluetooth range; this is the
// way in when they are not: a one-shot link, ten minutes, one device.

func (s *Server) handleCreateEnrolLink(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)

	// An open session is not enough: this link is a way in, and a laptop left
	// unlocked would otherwise be able to mint one. Re-verify on the spot.
	count, err := s.store.CountPasskeys(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	if count > 0 && !s.freshlyVerified(r, user) {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error": "verifikasi dulu di perangkat ini",
			"step":  "passkey",
		})
		return
	}

	nonce := make([]byte, 32)
	if _, err := rand.Read(nonce); err != nil {
		s.oops(w, err)
		return
	}
	expires := time.Now().Add(enrolTTL)
	if err := s.store.CreateEnrolToken(r.Context(), user.ID, nonce, expires); err != nil {
		s.oops(w, err)
		return
	}

	// One verification buys one link.
	s.clearFresh(w)

	writeJSON(w, http.StatusOK, map[string]any{
		// The token rides in the fragment, which browsers never send to a
		// server, so it cannot end up in an access log along the way.
		"url":        s.cfg.Origin + "/enrol#" + base64.RawURLEncoding.EncodeToString(nonce),
		"expires_at": expires,
	})
}

type enrolRequest struct {
	Token string `json:"token"`
}

func decodeNonce(raw string) ([]byte, bool) {
	nonce, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(raw))
	if err != nil || len(nonce) != 32 {
		return nil, false
	}
	return nonce, true
}

func (s *Server) handleEnrolBegin(w http.ResponseWriter, r *http.Request) {
	var in enrolRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "link nggak kebaca")
		return
	}
	enrolKey := "enrol:" + clientIP(r)
	if s.tooManyAttempts(w, quota{enrolKey, perAddress}) {
		return
	}

	nonce, ok := decodeNonce(in.Token)
	if !ok {
		failures.record(enrolKey)
		fail(w, http.StatusBadRequest, "link nggak valid")
		return
	}
	user, err := s.store.EnrolTokenUser(r.Context(), nonce)
	if err != nil {
		failures.record(enrolKey)
		fail(w, http.StatusUnauthorized, "link udah kepake atau kedaluwarsa")
		return
	}
	failures.clear(enrolKey)

	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}
	exclude := make([]protocol.CredentialDescriptor, 0, len(wu.creds))
	for _, c := range wu.creds {
		exclude = append(exclude, c.Descriptor())
	}

	options, session, err := s.wa.BeginRegistration(wu,
		webauthn.WithExclusions(exclude),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			// The device reading the link is the one being enrolled, so its own
			// sensor is exactly what we want.
			AuthenticatorAttachment: protocol.Platform,
			ResidentKey:             protocol.ResidentKeyRequirementPreferred,
			UserVerification:        protocol.VerificationRequired,
		}),
		webauthn.WithPublicKeyCredentialHints(
			[]protocol.PublicKeyCredentialHints{protocol.PublicKeyCredentialHintClientDevice}),
		webauthn.WithConveyancePreference(protocol.PreferNoAttestation),
	)
	if err != nil {
		s.log.Error("enrol begin", "err", err)
		fail(w, http.StatusInternalServerError, "gagal mulai daftar passkey")
		return
	}
	if err := s.setCeremony(w, session); err != nil {
		s.oops(w, err)
		return
	}

	// Carrying the token through the second half in a signed cookie keeps it
	// out of the finish URL, where the credential JSON already lives.
	body := base64.RawURLEncoding.EncodeToString(nonce)
	http.SetCookie(w, &http.Cookie{
		Name:     enrolCookie,
		Value:    body + "." + sign(s.cfg.SessionKey, body),
		Path:     "/",
		Expires:  time.Now().Add(enrolTTL),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, options)
}

func (s *Server) handleEnrolFinish(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(enrolCookie)
	if err != nil {
		fail(w, http.StatusBadRequest, "sesi pendaftaran habis, buka linknya lagi")
		return
	}
	body, mac, ok := strings.Cut(c.Value, ".")
	if !ok || mac != sign(s.cfg.SessionKey, body) {
		fail(w, http.StatusBadRequest, "link nggak valid")
		return
	}
	nonce, ok := decodeNonce(body)
	if !ok {
		fail(w, http.StatusBadRequest, "link nggak valid")
		return
	}

	session, err := s.readCeremony(r)
	if err != nil {
		fail(w, http.StatusBadRequest, "sesi pendaftaran habis, buka linknya lagi")
		return
	}
	user, err := s.store.EnrolTokenUser(r.Context(), nonce)
	if err != nil {
		fail(w, http.StatusUnauthorized, "link udah kepake atau kedaluwarsa")
		return
	}
	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}

	credential, err := s.wa.FinishRegistration(wu, *session, r)
	if err != nil {
		s.log.Error("enrol finish", "err", err)
		fail(w, http.StatusBadRequest, "passkey nggak keterima, coba lagi")
		return
	}
	// Burn the invitation before saving: if this fails the link was already
	// spent by someone else and the credential must not be kept.
	if err := s.store.UseEnrolToken(r.Context(), nonce); err != nil {
		fail(w, http.StatusUnauthorized, "link udah kepake atau kedaluwarsa")
		return
	}

	raw, err := json.Marshal(credential)
	if err != nil {
		s.oops(w, err)
		return
	}
	from := s.origin(r)
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		name = from.Device
	}
	if name == "" {
		name = "perangkat baru"
	}
	saved, err := s.store.AddPasskey(r.Context(), user.ID, credential.ID, raw, name, from)
	if err != nil {
		s.oops(w, err)
		return
	}

	s.clearCeremony(w)
	http.SetCookie(w, &http.Cookie{
		Name: enrolCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.cfg.SecureCookie, SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusCreated, saved)
}
