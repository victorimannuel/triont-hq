package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// Enrolling a device from a session that is already signed in. Two modes: the
// machine in front of you, or — with mode=other — whatever the browser's own
// cross-device flow can reach, which is the only way to enrol a phone.

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
