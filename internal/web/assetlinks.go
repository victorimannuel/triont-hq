package web

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"strings"
)

/*
The Android app signs in with passkeys too, and an assertion made inside an app
names the app as its origin — "android:apk-key-hash:" followed by the hash of
its signing certificate — rather than a URL. Which apps are ours is exactly
what /.well-known/assetlinks.json already declares, for Android's own checks.
Reading the same file here keeps one list: publish a new certificate there and
the server accepts it, forget it and neither side does.
*/

const assetLinksPath = "dist/.well-known/assetlinks.json"

type assetLink struct {
	Target struct {
		Namespace    string   `json:"namespace"`
		Fingerprints []string `json:"sha256_cert_fingerprints"`
	} `json:"target"`
}

// AndroidOrigins lists the WebAuthn origins of the Android apps named in the
// embedded assetlinks file, or nothing at all when there is no such file.
func AndroidOrigins() ([]string, error) {
	raw, err := fs.ReadFile(files, assetLinksPath)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var links []assetLink
	if err := json.Unmarshal(raw, &links); err != nil {
		return nil, fmt.Errorf("assetlinks.json: %w", err)
	}

	var origins []string
	for _, link := range links {
		if link.Target.Namespace != "android_app" {
			continue
		}
		for _, fp := range link.Target.Fingerprints {
			origin, err := apkKeyHashOrigin(fp)
			if err != nil {
				return nil, err
			}
			origins = append(origins, origin)
		}
	}
	return origins, nil
}

// apkKeyHashOrigin turns the colon-separated hex fingerprint Android tooling
// prints into the origin an app's assertion carries: the same 32 bytes,
// base64url without padding.
func apkKeyHashOrigin(fingerprint string) (string, error) {
	sum, err := hex.DecodeString(strings.ReplaceAll(fingerprint, ":", ""))
	if err != nil || len(sum) != sha256.Size {
		return "", fmt.Errorf("assetlinks.json: bad fingerprint %q", fingerprint)
	}
	return "android:apk-key-hash:" + base64.RawURLEncoding.EncodeToString(sum), nil
}
