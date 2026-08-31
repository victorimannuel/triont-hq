package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	// The image carries no zoneinfo, so TZ would silently mean UTC and the
	// morning reminder would arrive in the afternoon. This embeds the database.
	_ "time/tzdata"

	webpush "github.com/SherClockHolmes/webpush-go"
	"golang.org/x/crypto/bcrypt"

	"github.com/victorimannuel/triont-hq/internal/api"
	"github.com/victorimannuel/triont-hq/internal/config"
	"github.com/victorimannuel/triont-hq/internal/secret"
	"github.com/victorimannuel/triont-hq/internal/store"
	"github.com/victorimannuel/triont-hq/internal/web"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "genkey":
			key := make([]byte, 32)
			if _, err := rand.Read(key); err != nil {
				die(log, err)
			}
			fmt.Println(base64.StdEncoding.EncodeToString(key))
			return
		case "vapid":
			private, public, err := webpush.GenerateVAPIDKeys()
			if err != nil {
				die(log, err)
			}
			fmt.Println("HQ_VAPID_PUBLIC=" + public)
			fmt.Println("HQ_VAPID_PRIVATE=" + private)
			return
		case "passkeys-reset":
			if len(os.Args) != 3 {
				fmt.Fprintln(os.Stderr, "usage: hq passkeys-reset <email>")
				os.Exit(2)
			}
			n, err := clearPasskeys(os.Args[2])
			if err != nil {
				die(log, err)
			}
			fmt.Printf("removed %d passkey(s) for %s\n", n, os.Args[2])
			return
		case "passwd":
			if len(os.Args) != 4 {
				fmt.Fprintln(os.Stderr, "usage: hq passwd <email> <password>")
				os.Exit(2)
			}
			if err := setPassword(os.Args[2], os.Args[3]); err != nil {
				die(log, err)
			}
			fmt.Println("password updated for", os.Args[2])
			return
		}
	}

	if err := run(log); err != nil {
		die(log, err)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	if err := bootstrapOwner(ctx, log, st, cfg.OwnerEmail, cfg.OwnerPassword); err != nil {
		return err
	}

	box, err := secret.New(cfg.EncryptionKey)
	if err != nil {
		return fmt.Errorf("encryption key: %w", err)
	}

	mux := http.NewServeMux()
	server, err := api.New(cfg, st, box, log)
	if err != nil {
		return fmt.Errorf("webauthn: %w", err)
	}
	mux.Handle("/api/", server.Routes())

	// The reminder loop lives with the server: one process, one schedule, and
	// it stops when the server does.
	go server.RunReminders(ctx, cfg.ReminderHour)

	if ui, err := web.Handler(); err != nil {
		log.Warn("front-end bundle missing, serving API only", "err", err)
	} else {
		mux.Handle("/", ui)
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		log.Info("listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server stopped", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// bootstrapOwner creates the single account on an empty database. It refuses to
// touch an existing one, so leaving the variables set in the environment cannot
// silently reset the password on every restart.
func bootstrapOwner(ctx context.Context, log *slog.Logger, st *store.Store, email, password string) error {
	email, password = strings.TrimSpace(email), strings.TrimSpace(password)
	if email == "" || password == "" {
		return nil
	}
	n, err := st.CountUsers(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if _, err := st.UpsertUser(ctx, email, string(hash)); err != nil {
		return err
	}
	log.Info("owner account created", "email", email)
	return nil
}

// clearPasskeys is the way back in if every registered device is lost: run it
// on the server, then sign in with the password alone and enrol a new one.
func clearPasskeys(email string) (int64, error) {
	cfg, err := config.Load()
	if err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return 0, err
	}
	defer st.Close()
	if err := st.Migrate(ctx); err != nil {
		return 0, err
	}
	return st.ClearPasskeys(ctx, strings.ToLower(strings.TrimSpace(email)))
}

func setPassword(email, password string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = st.UpsertUser(ctx, email, string(hash))
	return err
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func die(log *slog.Logger, err error) {
	log.Error("fatal", "err", err)
	os.Exit(1)
}
