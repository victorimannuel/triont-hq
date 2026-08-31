package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
)

// Config is read once at boot. Anything missing that the app cannot safely
// invent is a hard error, so a misconfigured container fails loudly instead of
// starting up and silently storing secrets it cannot decrypt later.
type Config struct {
	Addr          string
	DatabaseURL   string
	SessionKey    []byte
	EncryptionKey []byte
	OwnerEmail    string
	OwnerPassword string
	SecureCookie  bool
	SessionDays   int
	// WebAuthn is bound to exactly one host; the browser refuses anything else.
	RPID   string
	Origin string
	// Web push. Without a key pair the notification endpoints simply report
	// themselves as unavailable rather than failing; everything else runs.
	VAPIDPublic  string
	VAPIDPrivate string
	VAPIDSubject string
	// Hour of the day, local time, the reminder goes out.
	ReminderHour int
	// Bearer token external monitors use to report in. The only door into
	// HQ that a session cookie does not open.
	MonitorToken string
}

func Load() (Config, error) {
	cfg := Config{
		Addr:          env("HQ_ADDR", ":8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		OwnerEmail:    os.Getenv("HQ_OWNER_EMAIL"),
		OwnerPassword: os.Getenv("HQ_OWNER_PASSWORD"),
		SecureCookie:  env("HQ_SECURE_COOKIE", "true") == "true",
		SessionDays:   envInt("HQ_SESSION_DAYS", 30),
		// Defaults suit a local run. A deployment sets both to its own host;
		// WebAuthn refuses to work against any origin but the one named here.
		RPID:   env("HQ_RP_ID", "localhost"),
		Origin: env("HQ_ORIGIN", "http://localhost:8080"),
		// No key pair means notifications are simply unavailable; nothing else
		// is affected, which is why these are not required.
		VAPIDPublic:  os.Getenv("HQ_VAPID_PUBLIC"),
		VAPIDPrivate: os.Getenv("HQ_VAPID_PRIVATE"),
		VAPIDSubject: env("HQ_VAPID_SUBJECT", "mailto:admin@localhost"),
		ReminderHour: envInt("HQ_REMINDER_HOUR", 7),
		// Empty disables the monitor ingest endpoint outright rather than
		// leaving it open with a guessable secret.
		MonitorToken: os.Getenv("HQ_MONITOR_TOKEN"),
	}

	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}

	var err error
	if cfg.SessionKey, err = decodeKey("HQ_SESSION_KEY", 32); err != nil {
		return cfg, err
	}
	if cfg.EncryptionKey, err = decodeKey("HQ_ENCRYPTION_KEY", 32); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func decodeKey(name string, want int) ([]byte, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return nil, fmt.Errorf("%s is required (base64 of %d random bytes)", name, want)
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("%s must be base64: %w", name, err)
	}
	if len(key) != want {
		return nil, fmt.Errorf("%s must decode to %d bytes, got %d", name, want, len(key))
	}
	return key, nil
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func envInt(name string, fallback int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
