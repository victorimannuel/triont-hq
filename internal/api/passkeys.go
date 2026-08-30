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

const (
	halfSessionCookie = "hq_half"
	ceremonyCookie    = "hq_ceremony"
	ceremonyTTL       = 5 * time.Minute
	enrolCookie       = "hq_enrol"
	enrolTTL          = 10 * time.Minute
	// A verification this recent is what a sensitive action asks for on top of
	// an already-open session.
	freshCookie = "hq_fresh"
	freshTTL    = 2 * time.Minute
)

// webauthnUser adapts our user plus their stored credentials to the shape the
// WebAuthn library expects.
type webauthnUser struct {
	user  store.User
	creds []webauthn.Credential
}

func (u webauthnUser) WebAuthnID() []byte                         { return []byte(u.user.Email) }
func (u webauthnUser) WebAuthnName() string                       { return u.user.Email }
func (u webauthnUser) WebAuthnDisplayName() string                { return u.user.Email }
func (u webauthnUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

func (s *Server) webauthnUser(r *http.Request, user store.User) (webauthnUser, error) {
	rows, err := s.store.Passkeys(r.Context(), user.ID)
	if err != nil {
		return webauthnUser{}, err
	}
	creds := make([]webauthn.Credential, 0, len(rows))
	for _, row := range rows {
		var c webauthn.Credential
		if err := json.Unmarshal(row.Credential, &c); err != nil {
			return webauthnUser{}, err
		}
		creds = append(creds, c)
	}
	return webauthnUser{user: user, creds: creds}, nil
}

// The ceremony session is signed rather than stored: it is short-lived, tied to
// one browser, and carries a challenge that is useless without the private key
// living on the device.
func (s *Server) setCeremony(w http.ResponseWriter, data *webauthn.SessionData) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	http.SetCookie(w, &http.Cookie{
		Name:     ceremonyCookie,
		Value:    body + "." + sign(s.cfg.SessionKey, body),
		Path:     "/",
		Expires:  time.Now().Add(ceremonyTTL),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteStrictMode,
	})
	return nil
}

func (s *Server) readCeremony(r *http.Request) (*webauthn.SessionData, error) {
	c, err := r.Cookie(ceremonyCookie)
	if err != nil {
		return nil, err
	}
	body, mac, ok := strings.Cut(c.Value, ".")
	if !ok || mac != sign(s.cfg.SessionKey, body) {
		return nil, errToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return nil, err
	}
	var data webauthn.SessionData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	return &data, nil
}

func (s *Server) clearCeremony(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: ceremonyCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.cfg.SecureCookie, SameSite: http.SameSiteStrictMode,
	})
}

// origin gathers what can be known about the machine on the other end: the
// label its own browser reports, the user agent, and the city the address
// resolves to. All three are hints, none is a guarantee.
func (s *Server) origin(r *http.Request) store.Origin {
	ip := clientIP(r)
	return store.Origin{
		Device:    strings.TrimSpace(r.URL.Query().Get("device")),
		UserAgent: r.UserAgent(),
		IP:        ip,
		Location:  s.locate(r.Context(), ip),
	}
}

// ---------------------------------------------------------------- register

func (s *Server) handlePasskeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}

	// Devices already enrolled are excluded so the same one cannot be added twice.
	exclude := make([]protocol.CredentialDescriptor, 0, len(wu.creds))
	for _, c := range wu.creds {
		exclude = append(exclude, c.Descriptor())
	}

	// Pinning the attachment to "platform" is what sends Windows straight to
	// Hello, but it also hides the "use a phone" option — and a phone is the
	// only way to enrol a phone from here. mode=other leaves the choice open so
	// the browser offers its own cross-device QR instead.
	selection := protocol.AuthenticatorSelection{
		ResidentKey: protocol.ResidentKeyRequirementPreferred,
		// Requiring user verification is what asks for the face or the
		// fingerprint rather than a bare tap.
		UserVerification: protocol.VerificationRequired,
	}
	// A browser that understands hints obeys them over the attachment, and it
	// is the hint that sends Chrome straight to the cross-device QR instead of
	// a chooser. The attachment stays as the fallback for browsers that do not.
	hints := []protocol.PublicKeyCredentialHints{protocol.PublicKeyCredentialHintClientDevice}
	if r.URL.Query().Get("mode") == "other" {
		hints = []protocol.PublicKeyCredentialHints{protocol.PublicKeyCredentialHintHybrid}
	} else {
		selection.AuthenticatorAttachment = protocol.Platform
	}

	options, session, err := s.wa.BeginRegistration(wu,
		webauthn.WithExclusions(exclude),
		webauthn.WithAuthenticatorSelection(selection),
		webauthn.WithPublicKeyCredentialHints(hints),
		webauthn.WithConveyancePreference(protocol.PreferNoAttestation),
	)
	if err != nil {
		s.log.Error("passkey register begin", "err", err)
		fail(w, http.StatusInternalServerError, "gagal mulai daftar passkey")
		return
	}
	if err := s.setCeremony(w, session); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, options)
}

func (s *Server) handlePasskeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	session, err := s.readCeremony(r)
	if err != nil {
		fail(w, http.StatusBadRequest, "sesi pendaftaran habis, ulangi")
		return
	}
	wu, err := s.webauthnUser(r, user)
	if err != nil {
		s.oops(w, err)
		return
	}

	name := strings.TrimSpace(r.URL.Query().Get("name"))
	credential, err := s.wa.FinishRegistration(wu, *session, r)
	if err != nil {
		s.log.Error("passkey register finish", "err", err)
		fail(w, http.StatusBadRequest, "passkey nggak keterima, coba lagi")
		return
	}
	s.clearCeremony(w)

	raw, err := json.Marshal(credential)
	if err != nil {
		s.oops(w, err)
		return
	}
	from := s.origin(r)
	if name == "" {
		name = from.Device
	}
	if name == "" {
		name = "perangkat tanpa nama"
	}
	saved, err := s.store.AddPasskey(r.Context(), user.ID, credential.ID, raw, name, from)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

// ------------------------------------------------------------------- login

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

// ------------------------------------------------------------- management

func (s *Server) handleListPasskeys(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	keys, err := s.store.Passkeys(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"passkeys": keys})
}

type passkeyName struct {
	Name string `json:"name"`
}

func (s *Server) handleRenamePasskey(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	var in passkeyName
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		fail(w, http.StatusBadRequest, "namanya nggak boleh kosong")
		return
	}

	saved, err := s.store.RenamePasskey(r.Context(), user.ID, id, in.Name)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeletePasskey(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	// Removing devices is how two-step protection gets switched off, so it
	// asks for the same fresh proof that handing out an enrolment link does.
	if !s.freshlyVerified(r, user) {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error": "verifikasi dulu di perangkat ini",
			"step":  "passkey",
		})
		return
	}

	if err := s.store.DeletePasskey(r.Context(), user.ID, id); err != nil {
		s.oops(w, err)
		return
	}
	// One verification, one removal.
	s.clearFresh(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ------------------------------------------------------- enrol from afar

// handleCreateEnrolLink hands back a URL that registers one passkey on
// whatever device opens it. The QR flow needs the two devices within Bluetooth
// range of each other; this is what covers the case where they are not.
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

// ------------------------------------------------------------- step up

// The step-up is an ordinary assertion against an already-signed-in session.
// It proves the person at the keyboard is still the one who owns a registered
// device, which a cookie on its own cannot.
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
