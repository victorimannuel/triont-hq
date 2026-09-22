package api

import (
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/victorimannuel/triont-hq/internal/store"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var in loginRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}

	// Checked before any hashing happens, so a blocked caller costs nothing.
	byIP := "ip:" + clientIP(r)
	byEmail := "email:" + strings.ToLower(strings.TrimSpace(in.Email))
	if s.tooManyAttempts(w, quota{byIP, perAddress}, quota{byEmail, perAccount}) {
		return
	}

	user, err := s.store.UserByEmail(r.Context(), in.Email)
	if err != nil {
		// Same reply whether the account is missing or the password is wrong.
		failures.record(byIP)
		failures.record(byEmail)
		fail(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.Password)) != nil {
		failures.record(byIP)
		failures.record(byEmail)
		fail(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	// The password was right; the budget resets whether or not a passkey
	// still has to answer.
	failures.clear(byIP, byEmail)

	// A registered passkey turns the password into the first of two steps. With
	// none registered the password alone still works, so nobody can be locked
	// out by simply never enrolling a device.
	count, err := s.store.CountPasskeys(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	if count > 0 {
		s.issueHalfSession(w, user)
		writeJSON(w, http.StatusOK, map[string]any{"step": "passkey", "email": user.Email})
		return
	}

	expiry := s.issueSession(w, user)
	writeJSON(w, http.StatusOK, map[string]any{
		"email": user.Email,
		// Returned for a future native client; the browser uses the cookie.
		"token":      signToken(s.cfg.SessionKey, user.ID, expiry),
		"expires_at": expiry,
	})
}

func (s *Server) issueSession(w http.ResponseWriter, user store.User) time.Time {
	expiry := time.Now().Add(time.Duration(s.cfg.SessionDays) * 24 * time.Hour)
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    signToken(s.cfg.SessionKey, user.ID, expiry),
		Path:     "/",
		Expires:  expiry,
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteStrictMode,
	})
	return expiry
}

// The half session says "the password checked out" and nothing more. It lasts
// minutes and opens no data endpoint.
func (s *Server) issueHalfSession(w http.ResponseWriter, user store.User) {
	expiry := time.Now().Add(ceremonyTTL)
	http.SetCookie(w, &http.Cookie{
		Name:     halfSessionCookie,
		Value:    signToken(s.cfg.SessionKey, user.ID, expiry),
		Path:     "/",
		Expires:  expiry,
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) clearHalfSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: halfSessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.cfg.SecureCookie, SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) halfSessionUser(r *http.Request) (store.User, error) {
	c, err := r.Cookie(halfSessionCookie)
	if err != nil {
		return store.User{}, err
	}
	id, err := parseToken(s.cfg.SessionKey, c.Value, time.Now())
	if err != nil {
		return store.User{}, err
	}
	return s.store.UserByID(r.Context(), id)
}

func (s *Server) handleLogout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	writeJSON(w, http.StatusOK, map[string]any{"email": user.Email})
}

type passwordChangeRequest struct {
	Current string `json:"current"`
	New     string `json:"new"`
}

const minPasswordLen = 8

// Changing the password takes the old one, not just an open session: a tab
// left open on a shared screen must not be enough to lock the owner out of
// their own account.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	var in passwordChangeRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "isian nggak kebaca")
		return
	}
	if len(in.New) < minPasswordLen {
		fail(w, http.StatusBadRequest, "password baru minimal 8 karakter")
		return
	}
	if in.New == in.Current {
		fail(w, http.StatusBadRequest, "password baru sama kayak yang lama")
		return
	}

	// The old password can be guessed from inside a session as easily as from
	// the login page, so it gets the same short leash.
	byUser := "pw:" + itoa(int(user.ID))
	if s.tooManyAttempts(w, quota{byUser, perAddress}) {
		return
	}
	// Re-read rather than trust the session's copy, so a password changed from
	// another device a moment ago is the one being checked.
	fresh, err := s.store.UserByID(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(fresh.PasswordHash), []byte(in.Current)) != nil {
		failures.record(byUser)
		fail(w, http.StatusUnauthorized, "password lama salah")
		return
	}
	failures.clear(byUser)

	hash, err := bcrypt.GenerateFromPassword([]byte(in.New), bcrypt.DefaultCost)
	if err != nil {
		s.oops(w, err)
		return
	}
	if err := s.store.SetPasswordHash(r.Context(), user.ID, string(hash)); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func trim(v string) string { return strings.TrimSpace(v) }
