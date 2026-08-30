// Package web serves the compiled React bundle out of the binary itself, so
// deploying the app is copying one file and nothing else.
package web

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"strings"
)

//go:embed all:dist
var files embed.FS

func init() {
	// Go's table has no entry for .webmanifest, and Chrome refuses a manifest
	// served as text/plain.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// Handler serves the bundle and falls back to index.html for client-side
// routes, while anything under /assets keeps a normal 404 so a typo in a
// script tag fails visibly instead of returning HTML.
func Handler() (http.Handler, error) {
	dist, err := fs.Sub(files, "dist")
	if err != nil {
		return nil, err
	}
	fileServer := http.FileServer(http.FS(dist))

	index, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		return nil, err
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			serveIndex(w, index)
			return
		}
		if _, err := fs.Stat(dist, path); err == nil {
			switch {
			case strings.HasPrefix(path, "assets/"):
				// Content-hashed filenames, so these can be cached forever.
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			case isPWAControlFile(path):
				// A stale service worker or manifest would pin an old build on
				// an installed app, so these are always revalidated.
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(path, "assets/") {
			http.NotFound(w, r)
			return
		}
		serveIndex(w, index)
	}), nil
}

func isPWAControlFile(path string) bool {
	switch path {
	case "sw.js", "registerSW.js", "manifest.webmanifest", "workbox-window.prod.es5.js":
		return true
	}
	return strings.HasPrefix(path, "workbox-")
}

func serveIndex(w http.ResponseWriter, index []byte) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(index)
}
