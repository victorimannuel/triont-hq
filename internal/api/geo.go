package api

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Where a passkey was registered or last used is only ever a hint — an IP puts
// you in the right city on a good day and in your ISP's city on a bad one. It
// exists so an unfamiliar entry looks unfamiliar, not as a record of fact.

type geoEntry struct {
	label string
	at    time.Time
}

var geo = struct {
	sync.Mutex
	seen map[string]geoEntry
}{seen: map[string]geoEntry{}}

const geoTTL = 24 * time.Hour

// clientIP trusts X-Real-IP because the only way in is through our own nginx,
// which sets it from the socket. Without that proxy the header would be
// whatever the caller felt like sending.
func clientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return ip
	}
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if first, _, ok := strings.Cut(fwd, ","); ok {
			return strings.TrimSpace(first)
		}
		return strings.TrimSpace(fwd)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func routable(ip string) bool {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	return !addr.IsPrivate() && !addr.IsLoopback() && !addr.IsLinkLocalUnicast() &&
		!addr.IsUnspecified()
}

// locate asks a free lookup service for the city behind an address. Every
// failure is silent: a passkey with no location is still a working passkey.
func (s *Server) locate(ctx context.Context, ip string) string {
	if !routable(ip) {
		return ""
	}

	geo.Lock()
	if hit, ok := geo.seen[ip]; ok && time.Since(hit.at) < geoTTL {
		geo.Unlock()
		return hit.label
	}
	geo.Unlock()

	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://ipapi.co/"+url.PathEscape(ip)+"/json/", nil)
	if err != nil {
		return ""
	}
	// The service answers 403 to a request with no user agent.
	req.Header.Set("User-Agent", "hq/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.log.Warn("geo lookup", "err", err)
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}

	var body struct {
		City    string `json:"city"`
		Region  string `json:"region"`
		Country string `json:"country_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return ""
	}

	parts := []string{}
	for _, part := range []string{body.City, body.Country} {
		if part = strings.TrimSpace(part); part != "" {
			parts = append(parts, part)
		}
	}
	label := strings.Join(parts, ", ")

	geo.Lock()
	geo.seen[ip] = geoEntry{label: label, at: time.Now()}
	geo.Unlock()

	return label
}
