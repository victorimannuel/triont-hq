package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

/*
The title of a YouTube video, so pasting a link fills the song in.

Asked for here rather than from the browser. Two reasons, and the second is the
one that matters: a page fetching youtube.com directly depends on their CORS
headers staying as they are, and — more to the point — the outbound request is
built from something the user typed, which is the shape of a request that wants
checking before it is made rather than after.

So the host is checked against a list, and the call that actually goes out is
always to the same oEmbed endpoint with the link as a parameter. There is no
input that turns this into a fetch of anything else.
*/
var youtubeHosts = map[string]bool{
	"youtube.com":       true,
	"www.youtube.com":   true,
	"m.youtube.com":     true,
	"music.youtube.com": true,
	"youtu.be":          true,
	"www.youtu.be":      true,
}

// Long enough for a slow reply, short enough that a hung request does not hold
// a connection open while somebody waits on a form.
const oembedTimeout = 6 * time.Second

func (s *Server) handleVideoTitle(w http.ResponseWriter, r *http.Request) {
	raw := trim(r.URL.Query().Get("url"))
	if raw == "" {
		fail(w, http.StatusBadRequest, "url wajib diisi")
		return
	}

	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		fail(w, http.StatusBadRequest, "link-nya nggak kebaca")
		return
	}
	if !youtubeHosts[strings.ToLower(parsed.Hostname())] {
		fail(w, http.StatusBadRequest, "cuma link youtube yang bisa diambil judulnya")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), oembedTimeout)
	defer cancel()

	endpoint := "https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape(raw)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		s.oops(w, err)
		return
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		s.log.Warn("oembed", "err", err)
		fail(w, http.StatusBadGateway, "nggak bisa nanya ke youtube")
		return
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		// A private, deleted or mistyped video all land here, and none of them
		// is something the person filling in a form can do anything about
		// beyond checking the link.
		fail(w, http.StatusNotFound, "videonya nggak ketemu")
		return
	}

	var body struct {
		Title  string `json:"title"`
		Author string `json:"author_name"`
	}
	// Capped: this is a small JSON document, and a reply that is not one should
	// not be read to the end to find that out.
	if err := json.NewDecoder(http.MaxBytesReader(w, res.Body, 64*1024)).Decode(&body); err != nil {
		fail(w, http.StatusBadGateway, "jawaban youtube nggak kebaca")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"title":  strings.TrimSpace(body.Title),
		"artist": strings.TrimSpace(strings.TrimSuffix(body.Author, " - Topic")),
	})
}
