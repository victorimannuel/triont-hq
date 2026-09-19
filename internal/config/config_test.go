package config

import (
	"slices"
	"testing"
)

/*
The shopping list's hours come in as text, and a schedule that is wrong is not
visible: the notifications that do arrive look exactly like a working one. So
the parsing is worth pinning down, particularly the cases where it has to give
up and take the default whole.
*/
func TestSupplyHoursParsing(t *testing.T) {
	fallback := []int{7, 15, 21}
	cases := []struct {
		name string
		set  bool
		raw  string
		want []int
	}{
		{"unset takes the default", false, "", fallback},
		{"empty takes the default", true, "", fallback},
		{"three hours", true, "7,15,21", []int{7, 15, 21}},
		{"spaces are allowed", true, " 6 , 18 ", []int{6, 18}},
		{"one hour is a schedule too", true, "9", []int{9}},
		{"midnight is a real hour", true, "0", []int{0}},
		{"last hour of the day", true, "23", []int{23}},

		// Half a schedule is worse than none, because the part that works
		// hides the part that does not.
		{"a bad entry drops the whole list", true, "7,noon,21", fallback},
		{"an hour past the day drops it", true, "7,24", fallback},
		{"a negative hour drops it", true, "-1,7", fallback},
		{"a stray comma drops it", true, "7,,21", fallback},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.set {
				t.Setenv("HQ_SUPPLY_HOURS", c.raw)
			}
			got := envHours("HQ_SUPPLY_HOURS", fallback)
			if !slices.Equal(got, c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
		})
	}
}
