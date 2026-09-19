package api

import (
	"testing"

	"github.com/victorimannuel/triont-hq/internal/store"
)

var pantry = []store.Food{
	{ID: 1, Name: "nasi putih", Unit: "centong", Grams: 100, Kcal: 130},
	{ID: 2, Name: "Telur Ceplok", Unit: "butir", Grams: 60, Kcal: 196},
}

/*
Matching is the seam where a model's words become numbers, and it is the seam
where being wrong is invisible: a name that fails to match still produces a row
on screen, just one with no calories behind it.
*/
func TestMatchFoodsNamesTheOnesItKnows(t *testing.T) {
	got := matchFoods([]namedItem{
		{Name: "nasi putih", Count: 2},
		// The model is asked for the exact name but is not made to shout it.
		{Name: "telur ceplok", Count: 1},
	}, pantry)

	if len(got) != 2 {
		t.Fatalf("got %d rows, want 2", len(got))
	}
	if got[0].FoodID == nil || *got[0].FoodID != 1 {
		t.Errorf("rice did not match: %+v", got[0])
	}
	if got[0].Unit != "centong" || got[0].Count != 2 {
		t.Errorf("rice came back as %+v", got[0])
	}
	if got[1].FoodID == nil || *got[1].FoodID != 2 {
		t.Errorf("egg did not match case-insensitively: %+v", got[1])
	}
	// The name that goes on the row is the table's, not the model's, so the
	// log does not fill up with three spellings of the same food.
	if got[1].Name != "Telur Ceplok" {
		t.Errorf("got name %q, want the table's spelling", got[1].Name)
	}
	for _, item := range got {
		if !item.Guessed {
			t.Errorf("%s arrived unmarked; nothing off a photo is confirmed", item.Name)
		}
		if item.Unknown {
			t.Errorf("%s was matched but still marked unknown", item.Name)
		}
	}
}

func TestMatchFoodsKeepsWhatItDoesNotKnow(t *testing.T) {
	got := matchFoods([]namedItem{{Name: "sambal matah", Count: 1}}, pantry)
	if len(got) != 1 {
		t.Fatalf("got %d rows, want 1", len(got))
	}
	if got[0].FoodID != nil {
		t.Errorf("an unknown food was matched to %v", *got[0].FoodID)
	}
	if !got[0].Unknown {
		t.Error("an unknown food has to say so, or it silently counts as nothing")
	}
	if got[0].Name != "sambal matah" {
		t.Errorf("got %q, want the name kept so it can be added", got[0].Name)
	}
}

func TestMatchFoodsRepairsAnImpossibleCount(t *testing.T) {
	got := matchFoods([]namedItem{
		{Name: "nasi putih", Count: 0},
		{Name: "nasi putih", Count: -3},
		{Name: "   ", Count: 2},
	}, pantry)

	// The blank name is dropped; a blank row in a food log is noise.
	if len(got) != 2 {
		t.Fatalf("got %d rows, want 2", len(got))
	}
	for _, item := range got {
		if item.Count != 1 {
			t.Errorf("count came through as %v, want it repaired to 1", item.Count)
		}
	}
}

// Asking for bare JSON works nearly always, and a feature does not get to hang
// on "nearly".
func TestOnlyJSONSurvivesAChattyReply(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"bare", `{"items":[]}`, `{"items":[]}`},
		{"fenced", "```json\n{\"items\":[]}\n```", `{"items":[]}`},
		{"prefaced", "Tentu! Ini hasilnya:\n{\"items\":[]}", `{"items":[]}`},
		{"nested braces", `pre {"items":[{"name":"x"}]} post`, `{"items":[{"name":"x"}]}`},
		{"nothing to find", "maaf, fotonya buram", "maaf, fotonya buram"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := onlyJSON(c.in); got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}
