package api

import (
	"net/http"
	"sync"
	"time"
)

// A password is the one credential here that can be guessed. Passkeys close the
// second step, but a password left as the only factor — or a window where none
// is registered — deserves a ceiling on how fast it can be tried.
//
// The window is per address and per account, whichever fills first.

const (
	// One address gets a short leash. The account gets a long one on purpose:
	// a strict per-account limit hands anyone who knows the email address a
	// way to lock the owner out of their own account at will. Reaching the
	// account ceiling takes a spread of addresses, and at that point being
	// locked for a quarter of an hour is the right answer.
	perAddress  = 8
	perAccount  = 40
	attemptWait = 15 * time.Minute
)

type attempts struct {
	sync.Mutex
	seen map[string][]time.Time
}

var failures = attempts{seen: map[string][]time.Time{}}

// blocked reports whether a key has spent its budget, and how long until the
// oldest attempt ages out.
func (a *attempts) blocked(key string, limit int) (bool, time.Duration) {
	a.Lock()
	defer a.Unlock()

	cutoff := time.Now().Add(-attemptWait)
	kept := a.seen[key][:0]
	for _, at := range a.seen[key] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) == 0 {
		delete(a.seen, key)
		return false, 0
	}
	a.seen[key] = kept

	if len(kept) < limit {
		return false, 0
	}
	return true, time.Until(kept[0].Add(attemptWait))
}

func (a *attempts) record(key string) {
	a.Lock()
	defer a.Unlock()
	a.seen[key] = append(a.seen[key], time.Now())

	// Nothing else prunes the map, and a login endpoint on the open internet
	// will collect addresses forever otherwise.
	if len(a.seen) > 4096 {
		cutoff := time.Now().Add(-attemptWait)
		for k, times := range a.seen {
			if len(times) == 0 || times[len(times)-1].Before(cutoff) {
				delete(a.seen, k)
			}
		}
	}
}

func (a *attempts) clear(keys ...string) {
	a.Lock()
	defer a.Unlock()
	for _, k := range keys {
		delete(a.seen, k)
	}
}

type quota struct {
	key   string
	limit int
}

// tooManyAttempts writes the refusal and reports whether it did. Callers check
// before doing any work, so a blocked address never reaches bcrypt — which is
// also what keeps the endpoint from being a way to burn the server's CPU.
func (s *Server) tooManyAttempts(w http.ResponseWriter, quotas ...quota) bool {
	for _, q := range quotas {
		if yes, wait := failures.blocked(q.key, q.limit); yes {
			seconds := int(wait.Seconds()) + 1
			w.Header().Set("Retry-After", itoa(seconds))
			fail(w, http.StatusTooManyRequests,
				"kebanyakan percobaan, tunggu "+minutes(wait))
			return true
		}
	}
	return false
}

func minutes(d time.Duration) string {
	m := int(d.Minutes()) + 1
	if m <= 1 {
		return "sebentar"
	}
	return itoa(m) + " menit"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
