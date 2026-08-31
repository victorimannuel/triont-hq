package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// The pieces every passkey ceremony needs: the user adapter the library asks
// for, the short-lived cookie that carries a challenge between the two halves
// of a ceremony, and what can be learned about the machine on the other end.
//
// The four flows that use them live next door: passkey_register.go,
// passkey_login.go, passkey_enrol.go and passkey_stepup.go.

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
