package api

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// A scan of an identity card is more sensitive than the number printed on it,
// so attachments take the same encryption as credential secrets and are only
// ever decrypted on their way to an authenticated response.

// Big enough for a phone photo of a document or a scanned PDF, small enough
// that the nightly dump stays something you can copy around.
const maxUpload = 10 << 20 // 10 MB

func (s *Server) handleListAttachments(w http.ResponseWriter, r *http.Request) {
	entity := r.PathValue("entity")
	if !store.FileEntityOK(entity) {
		fail(w, http.StatusBadRequest, "jenis record nggak dikenal")
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	files, err := s.store.Attachments(r.Context(), entity, id)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"attachments": files})
}

// The counts are keyed by id, which JSON turns into strings; the caller reads
// them back with the same string keys.
func (s *Server) handleAttachmentCounts(w http.ResponseWriter, r *http.Request) {
	entity := r.PathValue("entity")
	if !store.FileEntityOK(entity) {
		fail(w, http.StatusBadRequest, "jenis record nggak dikenal")
		return
	}

	counts, err := s.store.AttachmentCounts(r.Context(), entity)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"counts": counts})
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	entity := r.PathValue("entity")
	if !store.FileEntityOK(entity) {
		fail(w, http.StatusBadRequest, "jenis record nggak dikenal")
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	// The limit is enforced on the body itself, so an oversized upload is
	// refused while it arrives rather than after it has all been read.
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+1<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		fail(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file kegedean, maksimum %d MB", maxUpload>>20))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		fail(w, http.StatusBadRequest, "nggak ada file yang dikirim")
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(io.LimitReader(file, maxUpload+1))
	if err != nil {
		s.oops(w, err)
		return
	}
	if len(raw) == 0 {
		fail(w, http.StatusBadRequest, "filenya kosong")
		return
	}
	if len(raw) > maxUpload {
		fail(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file kegedean, maksimum %d MB", maxUpload>>20))
		return
	}

	sealed, err := s.box.SealBytes(raw)
	if err != nil {
		s.oops(w, err)
		return
	}

	// The browser's content type is a hint from the client; fall back to the
	// extension, and to something inert when neither says anything useful.
	kind := header.Header.Get("Content-Type")
	if kind == "" || kind == "application/octet-stream" {
		if guess := mime.TypeByExtension(filepath.Ext(header.Filename)); guess != "" {
			kind = guess
		}
	}
	if kind == "" {
		kind = "application/octet-stream"
	}

	saved, err := s.store.AddAttachment(r.Context(), store.Attachment{
		Entity:   entity,
		EntityID: id,
		// Only the base name: a browser that sends a path must not be able to
		// put one in the database.
		Name:      filepath.Base(header.Filename),
		MimeType:  kind,
		Size:      int64(len(raw)),
		Notes:     trim(r.FormValue("notes")),
		CreatedBy: actor(r),
	}, sealed)
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	meta, sealed, err := s.store.AttachmentContent(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	plain, err := s.box.OpenBytes(sealed)
	if err != nil {
		s.log.Error("attachment decrypt", "id", id, "err", err)
		fail(w, http.StatusInternalServerError, "file nggak bisa dibuka")
		return
	}

	// inline so a scan can be looked at without downloading it, but never as
	// something the browser will execute: everything that is not an image or a
	// PDF is handed over as a download instead.
	disposition := "attachment"
	if strings.HasPrefix(meta.MimeType, "image/") || meta.MimeType == "application/pdf" {
		disposition = "inline"
	}

	h := w.Header()
	h.Set("Content-Type", meta.MimeType)
	h.Set("Content-Length", fmt.Sprint(len(plain)))
	h.Set("Content-Disposition",
		fmt.Sprintf("%s; filename*=UTF-8''%s", disposition, urlEscape(meta.Name)))
	// Never cached: it is decrypted personal data, and a stale copy on disk is
	// the whole thing this encryption exists to avoid.
	h.Set("Cache-Control", "no-store")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	_, _ = w.Write(plain)
}

func (s *Server) handleDeleteAttachment(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	// Files are deleted outright rather than soft-deleted: a soft-deleted file
	// still sits decryptable in every backup, which is not what "delete this
	// scan of my passport" means.
	if err := s.store.DeleteAttachment(r.Context(), id); err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// urlEscape percent-encodes a filename for a Content-Disposition header.
func urlEscape(name string) string {
	var b strings.Builder
	for _, c := range []byte(name) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9',
			c == '-', c == '.', c == '_', c == '~':
			b.WriteByte(c)
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}
