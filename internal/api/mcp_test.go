package api

import (
	"strings"
	"testing"
	"time"
)

// Whatever the schema said, the model sends what it likes. Nothing here may
// fail on a bad value: a filter that arrives unreadable should widen the
// search back to everything rather than turn into an error the model has to
// puzzle over.
func TestArgumentsSurviveAnything(t *testing.T) {
	a := mcpArgs{
		"query":    "  rina  ",
		"limit":    float64(12),
		"low_only": true,
		"from":     "2026-01-31",
		"junk":     []any{1, 2},
	}

	if got := a.str("query"); got != "rina" {
		t.Errorf("str: got %q, want %q", got, "rina")
	}
	if got := a.str("missing"); got != "" {
		t.Errorf("str missing: got %q, want empty", got)
	}
	if got := a.str("junk"); got != "" {
		t.Errorf("str of the wrong type: got %q, want empty", got)
	}
	if got := a.num("limit", 40); got != 12 {
		t.Errorf("num: got %d, want 12", got)
	}
	if got := a.num("missing", 40); got != 40 {
		t.Errorf("num missing: got %d, want the fallback 40", got)
	}
	if got := a.num("query", 40); got != 40 {
		t.Errorf("num of the wrong type: got %d, want the fallback 40", got)
	}
	if !a.flag("low_only") {
		t.Error("flag: got false, want true")
	}
	if a.flag("query") {
		t.Error("flag of the wrong type: got true, want false")
	}

	if got := a.date("from", 0).Format("2006-01-02"); got != "2026-01-31" {
		t.Errorf("date: got %s, want 2026-01-31", got)
	}
	// An unparseable date is the same as no date: fall forward to the window
	// the tool would have used anyway.
	want := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	if got := a.date("junk", 30).Format("2006-01-02"); got != want {
		t.Errorf("date fallback: got %s, want %s", got, want)
	}
}

func TestToolSchemasAreWellFormed(t *testing.T) {
	tools := mcpToolList()
	if len(tools) != len(mcpTools) {
		t.Fatalf("listed %d tools, defined %d", len(tools), len(mcpTools))
	}

	seen := map[string]bool{}
	for _, tool := range tools {
		name, _ := tool["name"].(string)
		if name == "" {
			t.Fatalf("a tool has no name: %v", tool)
		}
		if seen[name] {
			t.Errorf("%s: listed twice", name)
		}
		seen[name] = true

		// The description is the only documentation the model gets. An empty
		// one turns the tool into a guess.
		if desc, _ := tool["description"].(string); len(desc) < 20 {
			t.Errorf("%s: description too short to be useful", name)
		}

		schema, ok := tool["inputSchema"].(map[string]any)
		if !ok {
			t.Fatalf("%s: no input schema", name)
		}
		props, ok := schema["properties"].(map[string]any)
		if !ok {
			t.Fatalf("%s: schema has no properties object", name)
		}
		// A required argument the schema never described is one the model
		// cannot supply.
		required, _ := schema["required"].([]string)
		for _, key := range required {
			if _, described := props[key]; !described {
				t.Errorf("%s: requires %q but never describes it", name, key)
			}
		}
	}
}

// The read-only stance is the whole reason this endpoint can exist without a
// confirmation step. It is worth a test rather than a comment: a tool added in
// a hurry is exactly how a surface like this stops being read-only.
func TestNothingHereWritesOrRevealsSecrets(t *testing.T) {
	banned := []string{"credential", "secret", "password", "reveal",
		"create", "update", "delete", "add", "set"}

	for _, tool := range mcpTools {
		if tool.Run == nil {
			t.Errorf("%s: has no implementation", tool.Name)
		}
		// Segment by segment, not substring: "assets" contains "set" and is
		// perfectly innocent.
		for _, part := range strings.Split(tool.Name, "_") {
			for _, word := range banned {
				if part == word || part == word+"s" {
					t.Errorf("%s: named after something this endpoint must not do (%q)", tool.Name, word)
				}
			}
		}
		// Namespaced, because the model sees these names alongside every other
		// server's tools.
		if !strings.HasPrefix(tool.Name, "hq_") {
			t.Errorf("%s: missing the hq_ prefix", tool.Name)
		}
	}
}
