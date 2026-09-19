package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

/*
Reading a plate off a photograph.

What a model is good at here is naming things: rice, a fried egg, three
crackers. What it is not good at is how much, because a single photograph has
no scale in it — no hand, no spoon, nothing of known size — so a portion is
inferred from how the food usually looks, which is a guess dressed as a number.

So this is deliberately only half the job. The model returns a list of foods
and a count of the food's own household units, every count comes back marked
`guessed`, and nothing is saved until a person has looked at the numbers. The
food table supplies the grams and the macros; the photograph never does.

The photograph does leave the server for this, and it only leaves when the
button is pressed and only when a key has been configured. With no key the
endpoint says so plainly and the rest of the module carries on working by hand.
*/

// Long enough for a vision call on a slow link, short enough that a hung
// request does not hold a connection while somebody waits on a form.
const visionTimeout = 45 * time.Second

/*
The largest photograph this will send.

Not an API limit — base64 inflates a picture by a third and the JSON body is
another copy of that, so a photograph passes through memory several times over
inside a container that is capped at 96 MB. Four megabytes takes any phone
photo worth reading and leaves the box room to be doing something else at the
same time. Anything bigger is refused out loud rather than risking the process.
*/
const maxPhotoBytes = 4 << 20

var visionMimes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

type guessedItem struct {
	// The food row it matched, when the name came back as one HQ already
	// knows. Null means the model named something not in the table, which is
	// a prompt to add it rather than an error.
	FoodID  *int64  `json:"food_id"`
	Name    string  `json:"name"`
	Unit    string  `json:"unit"`
	Count   float64 `json:"count"`
	Guessed bool    `json:"guessed"`
	// True when nothing in the food table matched, so the page can offer to
	// add it instead of pretending it has numbers for it.
	Unknown bool `json:"unknown"`
}

func (s *Server) handleGuessMeal(w http.ResponseWriter, r *http.Request) {
	if s.cfg.VisionKey == "" {
		fail(w, http.StatusServiceUnavailable,
			"tebak dari foto belum diatur: isi HQ_VISION_KEY dulu")
		return
	}
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}

	meal, err := s.store.MealByID(r.Context(), id)
	if err != nil {
		s.oops(w, err)
		return
	}
	if meal.ImageID == nil {
		fail(w, http.StatusBadRequest, "belum ada fotonya")
		return
	}

	file, sealed, err := s.store.AttachmentContent(r.Context(), *meal.ImageID)
	if err != nil {
		s.oops(w, err)
		return
	}
	if !visionMimes[file.MimeType] {
		fail(w, http.StatusBadRequest, "fotonya harus jpeg, png, webp atau gif")
		return
	}
	photo, err := s.box.OpenBytes(sealed)
	if err != nil {
		s.log.Error("meal photo decrypt", "id", *meal.ImageID, "err", err)
		fail(w, http.StatusInternalServerError, "fotonya nggak bisa dibuka")
		return
	}
	if len(photo) > maxPhotoBytes {
		fail(w, http.StatusBadRequest, "fotonya kegedean buat ditebak")
		return
	}

	foods, err := s.store.ListFoods(r.Context(), "")
	if err != nil {
		s.oops(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), visionTimeout)
	defer cancel()

	named, err := s.askVision(ctx, photo, file.MimeType, foods)
	if err != nil {
		s.log.Warn("vision", "err", err)
		fail(w, http.StatusBadGateway, "gagal nanya ke model")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": matchFoods(named, foods)})
}

// namedItem is what the model is asked to return: a name and a count, nothing
// that pretends to be nutrition.
type namedItem struct {
	Name  string  `json:"name"`
	Count float64 `json:"count"`
}

/*
matchFoods turns names into rows.

Matching is on the name alone, lowercased, because that is the only handle the
model was given. Anything unmatched comes back marked unknown with the count
kept: the count is still the useful half, and the page can ask for grams and
macros once and then know that food for ever.
*/
func matchFoods(named []namedItem, foods []store.Food) []guessedItem {
	byName := make(map[string]store.Food, len(foods))
	for _, food := range foods {
		byName[strings.ToLower(food.Name)] = food
	}

	out := make([]guessedItem, 0, len(named))
	for _, item := range named {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		count := item.Count
		if count <= 0 {
			count = 1
		}
		if food, ok := byName[strings.ToLower(name)]; ok {
			id := food.ID
			out = append(out, guessedItem{
				FoodID: &id, Name: food.Name, Unit: food.Unit,
				Count: count, Guessed: true,
			})
			continue
		}
		out = append(out, guessedItem{
			Name: name, Unit: "porsi", Count: count, Guessed: true, Unknown: true,
		})
	}
	return out
}

// The instruction the model gets. It is told the list it may choose from and
// the unit each name is counted in, so a count comes back in something HQ can
// multiply rather than in grams it would have had to invent.
func visionPrompt(foods []store.Food) string {
	var known strings.Builder
	for _, food := range foods {
		fmt.Fprintf(&known, "- %s (dihitung per %s)\n", food.Name, food.Unit)
	}

	return `Lihat foto makanan ini dan sebutkan apa saja yang ada di piring.

Ini daftar makanan yang sudah dikenal, dengan satuan hitungnya:
` + known.String() + `
Aturan:
- Pakai nama PERSIS dari daftar di atas kalau makanannya ada di situ.
- Kalau tidak ada di daftar, pakai nama Indonesia yang umum dan singkat.
- "count" adalah berapa banyak satuan itu, boleh pecahan (misal 1.5).
- Jangan menebak apa pun yang tidak terlihat di foto.
- Minuman yang terlihat ikut dihitung.

Jawab HANYA dengan JSON, tanpa penjelasan dan tanpa blok kode:
{"items":[{"name":"nasi putih","count":2},{"name":"telur ceplok","count":1}]}`
}

/*
askVision is the one outbound call.

Kept to a single shape on purpose: one endpoint, one model, an image and a
fixed instruction. Nothing a person typed becomes part of the request, so there
is no input that turns this into a call to something else.
*/
func (s *Server) askVision(ctx context.Context, photo []byte, mime string, foods []store.Food) ([]namedItem, error) {
	body, err := json.Marshal(map[string]any{
		"model":      s.cfg.VisionModel,
		"max_tokens": 1024,
		"messages": []any{map[string]any{
			"role": "user",
			"content": []any{
				map[string]any{
					"type": "image",
					"source": map[string]any{
						"type":       "base64",
						"media_type": mime,
						"data":       base64.StdEncoding.EncodeToString(photo),
					},
				},
				map[string]any{"type": "text", "text": visionPrompt(foods)},
			},
		}},
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", s.cfg.VisionKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vision: %s", res.Status)
	}

	var reply struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(res.Body).Decode(&reply); err != nil {
		return nil, err
	}

	var said strings.Builder
	for _, part := range reply.Content {
		if part.Type == "text" {
			said.WriteString(part.Text)
		}
	}

	var parsed struct {
		Items []namedItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(onlyJSON(said.String())), &parsed); err != nil {
		return nil, fmt.Errorf("vision: jawabannya bukan JSON: %w", err)
	}
	return parsed.Items, nil
}

// onlyJSON pulls the object out of a reply that came wrapped in prose or a
// code fence anyway. Asking for bare JSON works nearly always, and "nearly" is
// not a thing to hang a feature on.
func onlyJSON(text string) string {
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return text
	}
	return text[start : end+1]
}
