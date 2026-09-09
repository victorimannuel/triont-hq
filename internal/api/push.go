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
	Lang   string `json:"lang"`
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
		Lang:     known(in.Lang),
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

/*
handleTestPush plays out a whole morning on demand: every deadline as its own
notification, then what has broken and what has run out, in the order the
seven o'clock run would send them.

Sending a canned line would prove less than it looks — a test that shows
something other than the thing being tested tells you the wording is fine when
it may not be. So this sends the real notifications, worded and tagged exactly
as the morning words and tags them.

Nothing is claimed here. Tomorrow's real run still fires.
*/
func (s *Server) handleTestPush(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey).(store.User)

	// The language the tester is reading right now, only so the preview it
	// gets back matches the page it is standing on. An absent body is fine.
	var in struct {
		Lang string `json:"lang"`
	}
	_ = readJSON(r, &in)

	subs, err := s.store.Subscriptions(r.Context(), user.ID)
	if err != nil {
		s.oops(w, err)
		return
	}
	if len(subs) == 0 {
		fail(w, http.StatusBadRequest, "belum ada perangkat yang berlangganan")
		return
	}

	here := known(in.Lang)
	// What this browser would read, whatever language the other devices are
	// subscribed in. A deadline puts its name in the title, so the body alone
	// would leave out the half that identifies it.
	lines := []string{}
	sent := 0

	for _, due := range s.dueNow(r.Context()) {
		sent += s.pushEach(r.Context(), subs, func(lang string) payload {
			return eventPayload(due, lang)
		})
		shown := eventPayload(due, here)
		lines = append(lines, shown.Title+" — "+shown.Body)
	}

	low, _ := s.store.LowSupplies(r.Context())
	trouble, _ := s.store.Trouble(r.Context())
	for _, group := range roundups(low, trouble) {
		sent += s.pushEach(r.Context(), subs, func(lang string) payload {
			return roundupPayload(group, lang)
		})
		shown := roundupPayload(group, here)
		lines = append(lines, shown.Title+" — "+shown.Body)
	}

	// A quiet morning still has to prove the path works, so it says so.
	if len(lines) == 0 {
		sent += s.pushEach(r.Context(), subs, func(lang string) payload {
			return payload{
				Title: "HQ",
				Body:  textNothingDue(lang),
				URL:   "/supplies",
				Tag:   "hq-test",
			}
		})
		lines = append(lines, textNothingDue(here))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sent":    sent,
		"devices": len(subs),
		"notices": len(lines),
		"preview": strings.Join(lines, "\n"),
	})
}

// pushEach sends each device the wording of the language it subscribed in.
// build is called once per language present, not once per device.
func (s *Server) pushEach(
	ctx context.Context,
	subs []store.PushSubscription,
	build func(lang string) payload,
) int {
	groups := map[string][]store.PushSubscription{}
	for _, sub := range subs {
		lang := known(sub.Lang)
		groups[lang] = append(groups[lang], sub)
	}

	sent := 0
	for lang, group := range groups {
		sent += s.push(ctx, group, build(lang))
	}
	return sent
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

// --------------------------------------------------------- the morning run

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
			// The check-in gets its own hour. Asking at seven in the morning
			// would list every habit every day, because none of them have
			// happened yet — a notification that is always the same is one
			// you stop reading.
			if now.Hour() == s.cfg.HabitHour {
				s.announceHabits(ctx)
			}
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
			// Dated things get one notification each; the roundups below are
			// left with what has no date — what has run out, what is broken.
			s.announceDueEvents(ctx)
			s.announceRoundups(ctx)
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
		s.pushEach(ctx, subs, func(lang string) payload {
			return payload{
				Title: textSilentTitle(lang, m.Source),
				Body:  textSilentBody(lang, since(lang, m.LastSeenAt), m.SilentAfter),
				URL:   "/monitor",
				Tag:   "hq-silent-" + m.Source,
			}
		})
	}
}

// since is the rough age of something, for a notification that has room for
// "3 jam" and not for a timestamp.
func since(lang string, at time.Time) string {
	mins := int(time.Since(at).Minutes())
	switch {
	case mins < 60:
		return textMinutes(lang, mins)
	case mins < 48*60:
		return textHours(lang, mins/60)
	default:
		return textDays(lang, mins/(60*24))
	}
}

/*
roundup is one half of the morning's dateless news: what has run out, or what
has broken. They used to leave as a single notification — a headline about
something broken with a shopping list underneath and one link for both — so
neither could be opened, acted on, or put away without the other.

They are separate errands. One ends at the shop and one ends at the monitor,
so each gets its own notification and its own row in the inbox.
*/
type roundup struct {
	// Kind picks the icon and the wording in the app. Neither of these is a
	// calendar kind: nothing here has a date, it is simply true until dealt
	// with.
	Kind  string
	URL   string
	Names []string
	// How many of the supplies have actually run out, as opposed to merely
	// got low. Zero on the trouble half, which has no such distinction.
	Out int
}

func roundups(low []store.Supply, trouble []store.Check) []roundup {
	out := []roundup{}
	// Something broken outranks the shopping list, so it goes first and lands
	// above it on the lock screen.
	if len(trouble) > 0 {
		names := make([]string, 0, len(trouble))
		for _, check := range trouble {
			names = append(names, check.Name)
		}
		out = append(out, roundup{Kind: "trouble", URL: "/monitor", Names: names})
	}
	if len(low) > 0 {
		names := make([]string, 0, len(low))
		empty := 0
		for _, item := range low {
			names = append(names, item.Name)
			if item.Quantity <= 0 {
				empty++
			}
		}
		out = append(out, roundup{
			Kind: "supply", URL: "/supplies", Names: names, Out: empty,
		})
	}
	return out
}

/*
announceHabits is the evening check-in. It is a question rather than a report:
the notification opens the page that asks about each habit in turn, so the
answer costs one tap from a lock screen instead of a trip to a grid.

Nothing left to ask means nothing is sent. A tracker that congratulates you
every night teaches you to swipe its notifications away.
*/
func (s *Server) announceHabits(ctx context.Context) {
	y, m, d := time.Now().Date()
	day := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)

	left, err := s.store.HabitsUndone(ctx, day)
	if err != nil {
		s.log.Error("habits undone", "err", err)
		return
	}
	if len(left) == 0 {
		return
	}

	// The same shape as a deadline's key, so the inbox unpacks it and the row
	// links to the check-in like any other notification.
	key := fmt.Sprintf("habit|/habits/checkin|%s", day.Format("2006-01-02"))
	claimed, err := s.store.ClaimEventNotice(ctx, key, strings.Join(left, ", "), day)
	if err != nil {
		s.log.Error("claim habit nudge", "err", err)
		return
	}
	if !claimed {
		return
	}

	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil || len(subs) == 0 {
		return
	}

	sent := s.pushEach(ctx, subs, func(lang string) payload {
		return payload{
			Title: textHabitTitle(lang, len(left)),
			Body:  listSome(lang, left, 3),
			URL:   "/habits/checkin",
			Tag:   "hq-habit-" + day.Format("2006-01-02"),
		}
	})
	s.log.Info("habit check-in sent", "left", len(left), "devices", sent)
}

// roundupPayload words one of them. A notification has room for a headline and
// about two lines, so the names run as far as that allows and are counted
// after.
func roundupPayload(r roundup, lang string) payload {
	title, body := textLowTitle(lang, r.Out, len(r.Names)-r.Out), listSome(lang, r.Names, 3)
	if r.Kind == "trouble" {
		title = textTroubleTitle(lang, len(r.Names))
	} else {
		// Naming what has run out is an instruction, not a report.
		body = textBuyPrefix(lang) + body
	}

	return payload{
		Title: title,
		Body:  body,
		URL:   r.URL,
		// One tag per kind per day, so a second run in the same morning
		// replaces its own notification instead of stacking beside it.
		Tag: "hq-" + r.Kind + "-" + time.Now().Format("2006-01-02"),
	}
}

// roundupKey is the shape noticeKey builds, so the inbox unpacks a roundup the
// same way it unpacks a deadline.
func roundupKey(r roundup, day time.Time) string {
	return fmt.Sprintf("%s|%s|%s", r.Kind, r.URL, day.Format("2006-01-02"))
}

// announceRoundups sends what has no date on it. Each half is claimed the way
// a deadline is, so it lands in the inbox as its own row with its own link and
// a restart mid-morning cannot say it twice.
func (s *Server) announceRoundups(ctx context.Context) {
	low, err := s.store.LowSupplies(ctx)
	if err != nil {
		s.log.Error("roundup supplies", "err", err)
		return
	}
	trouble, err := s.store.Trouble(ctx)
	if err != nil {
		s.log.Error("roundup trouble", "err", err)
		return
	}

	groups := roundups(low, trouble)
	if len(groups) == 0 {
		return
	}

	subs, err := s.store.AllSubscriptions(ctx)
	if err != nil {
		s.log.Error("roundup subscriptions", "err", err)
		return
	}

	y, m, d := time.Now().Date()
	day := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)

	for _, group := range groups {
		// The whole list, not the three the phone had room for. The inbox is
		// read on a screen that can scroll.
		label := strings.Join(group.Names, ", ")
		claimed, err := s.store.ClaimEventNotice(ctx, roundupKey(group, day), label, day)
		if err != nil {
			s.log.Error("claim roundup", "kind", group.Kind, "err", err)
			continue
		}
		if !claimed || len(subs) == 0 {
			continue
		}

		sent := s.pushEach(ctx, subs, func(lang string) payload {
			return roundupPayload(group, lang)
		})
		s.log.Info("roundup sent", "kind", group.Kind, "count", len(group.Names), "devices", sent)
	}
}

// listSome names the first few and counts whatever is left, because a
// notification longer than two lines is truncated by the phone anyway.
func listSome(lang string, labels []string, named int) string {
	if len(labels) <= named {
		return strings.Join(labels, ", ")
	}
	return textAndMore(lang, strings.Join(labels[:named], ", "), len(labels)-named)
}
