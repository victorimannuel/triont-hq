package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// A session token is "<userID>.<expiryUnix>.<hmac>". It is deliberately not a
// JWT: there is one audience, one key, and no claims worth negotiating, so a
// signed pair of integers does the whole job with no library.
var errToken = errors.New("api: invalid token")

func signToken(key []byte, userID int64, expiry time.Time) string {
	body := fmt.Sprintf("%d.%d", userID, expiry.Unix())
	return body + "." + sign(key, body)
}

func parseToken(key []byte, token string, now time.Time) (int64, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, errToken
	}
	body := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(sign(key, body))) {
		return 0, errToken
	}

	userID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, errToken
	}
	expiry, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, errToken
	}
	if now.Unix() >= expiry {
		return 0, errToken
	}
	return userID, nil
}

func sign(key []byte, body string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
