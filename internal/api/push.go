package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// Notifications go straight from this server to the browser's own push
// service. Nothing passes through a third party that could read them, and
// there is no account to keep anywhere else.

// payload is what the service worker receives and turns into a notification.
// The icons travel with it so changing them does not have to wait for a new
// worker to reach every device.
type payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
	Icon  string `json:"icon"`
	Badge string `json:"badge"`
}

const (
	notificationIcon = "/pwa-192.png"
	// Android reads the badge's alpha channel and paints it white, so this one
	// is the mark on transparent. A filled icon arrives as a white square.
	notificationBadge = "/badge-96.png"
)

func (s *Server) handlePushKey(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"key":     s.cfg.VAPIDPublic,
		"enabled": s.cfg.VAPIDPublic != "",
	})
}

type subscribeRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
	Device string `json:"device"`
}

func (s *Server) handleSubscribe(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)

	var in subscribeRequest
	if err := readJSON(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "langganan notif nggak kebaca")
		return
	}
	if in.Endpoint == "" || in.Keys.P256dh == "" || in.Keys.Auth == "" {
		fail(w, http.StatusBadRequest, "langganan notif nggak lengkap")
		return
	}

	err := s.store.Subscribe(r.Context(), user.ID, store.PushSubscription{
		Endpoint: in.Endpoint,
		P256dh:   in.Keys.P256dh,
		Auth:     in.Keys.Auth,
		Device:   strings.TrimSpace(in.Device),
	})
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (s *Server) handleListSubscriptions(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	subs, err := s.store.Subscriptions(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscriptions": subs})
}

func (s *Server) handleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.Unsubscribe(r.Context(), user.ID, id); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleUnsubscribeEndpoint is what a browser calls when it switches
// notifications off for itself. It knows its own endpoint and not the row id,
// and matching on a device name would be guesswork.
func (s *Server) handleUnsubscribeEndpoint(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if err := readJSON(r, &in); err != nil || in.Endpoint == "" {
		fail(w, http.StatusBadRequest, "endpoint nggak kebaca")
		return
	}
	if err := s.store.UnsubscribeEndpoint(r.Context(), in.Endpoint); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleTestPush proves the whole path works without waiting for tomorrow.
func (s *Server) handleTestPush(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)
	subs, err := s.store.Subscriptions(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	if len(subs) == 0 {
		fail(w, http.StatusBadRequest, "belum ada perangkat yang berlangganan")
		return
	}

	// Send the real digest rather than a canned line: a test that shows
	// something other than the thing being tested proves less than it looks.
	body := payload{
		Title: "HQ",
		Body:  "notifikasi jalan. nggak ada tenggat minggu ini.",
		URL:   "/calendar",
		Tag:   "hq-test",
	}
	due, _ := s.store.DueWithin(r.Context(), digestWindowDays)
	low, _ := s.store.LowSupplies(r.Context())
	trouble, _ := s.store.Trouble(r.Context())
	if len(due) > 0 || len(low) > 0 || len(trouble) > 0 {
		body.Title = digestTitle(due, low, trouble)
		body.Body = digestBody(due, low, trouble)
	}

	sent := s.push(r.Context(), subs, body)
	writeJSON(w, http.StatusOK, map[string]any{
		"sent": sent, "devices": len(subs), "preview": body.Body,
	})
}

// push delivers to every subscription and returns how many were accepted. A
// device the push service reports as gone is dropped: it means the app was
// uninstalled or permission was withdrawn, and it will never work again.
func (s *Server) push(ctx context.Context, subs []store.PushSubscription, body payload) int {
	if s.cfg.VAPIDPublic == "" || s.cfg.VAPIDPrivate == "" {
		s.log.Warn("push skipped, no VAPID keys configured")
		return 0
	}

	body.Icon, body.Badge = notificationIcon, notificationBadge

	raw, err := json.Marshal(body)
	if err != nil {
		s.log.Error("push payload", "err", err)
		return 0
	}

	sent := 0
	for _, sub := range subs {
		resp, err := webpush.SendNotificationWithContext(ctx, raw, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, &webpush.Options{
			Subscriber:      s.cfg.VAPIDSubject,
			VAPIDPublicKey:  s.cfg.VAPIDPublic,
			VAPIDPrivateKey: s.cfg.VAPIDPrivate,
			TTL:             24 * 60 * 60,
		})
		if err != nil {
			s.log.Error("push send", "device", sub.Device, "err", err)
			_ = s.store.MarkPushed(ctx, sub.ID, true)
			continue
		}
		resp.Body.Close()

		switch {
		case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
			s.log.Info("push subscription gone, dropping", "device", sub.Device)
			_ = s.store.UnsubscribeEndpoint(ctx, sub.Endpoint)
		case resp.StatusCode >= 200 && resp.StatusCode < 300:
			_ = s.store.MarkPushed(ctx, sub.ID, false)
			sent++
		default:
			s.log.Error("push rejected", "device", sub.Device, "status", resp.StatusCode)
			_ = s.store.MarkPushed(ctx, sub.ID, true)
		}
	}
	return sent
}

// detached gives background work its own deadline, so a push that outlives
// the request that triggered it is still bounded.
func detached() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}

// ------------------------------------------------------------ daily digest

// A week ahead: far enough to act on a domain or a bill, near enough that the
// list stays short enough to read on a lock screen.
const digestWindowDays = 7

// Reminders go out once a day. The loop wakes often and does nothing most of
// the time; claiming the day in the database is what makes "once" true across
// restarts rather than depending on the process staying up.
func (s *Server) RunReminders(ctx context.Context, hour int) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// A monitor that has gone quiet cannot report that it has gone
			// quiet, so this is the only place it gets noticed.
			s.announceSilence(ctx)

			now := time.Now()
			if now.Hour() != hour {
				continue
			}
			claimed, err := s.store.ClaimDigest(ctx, now)
			if err != nil {
				s.log.Error("digest claim", "err", err)
				continue
			}
			if !claimed {
				continue
			}
			s.sendDigest(ctx)
		}
	}
}

func (s *Server) announceSilence(ctx context.Context) {
	gone, err := s.store.ClaimStale(ctx)
	if err != nil {
		s.log.Error("stale monitors", "err", err)
		return
	}
	if len(gone) == 0 {
		return
	}

	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil || len(subs) == 0 {
		return
	}

	for _, m := range gone {
		s.log.Error("monitor went quiet", "source", m.Source, "last", m.LastSeenAt)
		s.push(ctx, subs, payload{
			Title: m.Source + " berhenti lapor",
			Body: fmt.Sprintf("terakhir %s lalu, batasnya %d menit",
				since(m.LastSeenAt), m.SilentAfter),
			URL: "/monitor",
			Tag: "hq-silent-" + m.Source,
		})
	}
}

// since is the rough age of something, for a notification that has room for
// "3 jam" and not for a timestamp.
func since(at time.Time) string {
	mins := int(time.Since(at).Minutes())
	switch {
	case mins < 60:
		return fmt.Sprintf("%d menit", mins)
	case mins < 48*60:
		return fmt.Sprintf("%d jam", mins/60)
	default:
		return fmt.Sprintf("%d hari", mins/(60*24))
	}
}

func (s *Server) sendDigest(ctx context.Context) {
	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil {
		s.log.Error("digest subscriptions", "err", err)
		return
	}
	if len(subs) == 0 {
		return
	}

	due, err := s.store.DueWithin(ctx, digestWindowDays)
	if err != nil {
		s.log.Error("digest entries", "err", err)
		return
	}
	low, err := s.store.LowSupplies(ctx)
	if err != nil {
		s.log.Error("digest supplies", "err", err)
		return
	}
	trouble, err := s.store.Trouble(ctx)
	if err != nil {
		s.log.Error("digest trouble", "err", err)
		return
	}
	if len(due) == 0 && len(low) == 0 && len(trouble) == 0 {
		return
	}

	body := digestBody(due, low, trouble)
	sent := s.push(ctx, subs, payload{
		Title: digestTitle(due, low, trouble),
		Body:  body,
		URL:   "/calendar",
		// One tag per day, so a second send would replace rather than stack.
		Tag: "hq-digest-" + time.Now().Format("2006-01-02"),
	})
	s.log.Info("digest sent", "entries", len(due), "low", len(low),
		"trouble", len(trouble), "devices", sent)
}

// A morning notification has room for a headline and about two lines. Both
// halves of it — what falls due, and what has run out — get named as far as
// that allows, then counted.

func digestTitle(due []store.CalendarEntry, low []store.Supply, trouble []store.Check) string {
	// Something broken outranks everything else the morning has to say.
	if len(trouble) > 0 {
		return fmt.Sprintf("%d hal bermasalah", len(trouble))
	}
	switch {
	case len(due) > 0 && len(low) > 0:
		return fmt.Sprintf("%d tenggat, %d stok menipis", len(due), len(low))
	case len(due) > 0:
		return fmt.Sprintf("%d tenggat minggu ini", len(due))
	default:
		return fmt.Sprintf("%d stok menipis", len(low))
	}
}

func digestBody(due []store.CalendarEntry, low []store.Supply, trouble []store.Check) string {
	parts := []string{}
	if len(trouble) > 0 {
		labels := make([]string, 0, len(trouble))
		for _, check := range trouble {
			labels = append(labels, check.Name)
		}
		parts = append(parts, listSome(labels, 3))
	}
	if len(due) > 0 {
		labels := make([]string, 0, len(due))
		for _, entry := range due {
			labels = append(labels, entry.Label)
		}
		parts = append(parts, listSome(labels, 3))
	}
	if len(low) > 0 {
		labels := make([]string, 0, len(low))
		for _, item := range low {
			labels = append(labels, item.Name)
		}
		parts = append(parts, "beli: "+listSome(labels, 3))
	}
	return strings.Join(parts, " · ")
}

// listSome names the first few and counts whatever is left, because a
// notification longer than two lines is truncated by the phone anyway.
func listSome(labels []string, named int) string {
	if len(labels) <= named {
		return strings.Join(labels, ", ")
	}
	return fmt.Sprintf("%s, dan %d lagi",
		strings.Join(labels[:named], ", "), len(labels)-named)
}
