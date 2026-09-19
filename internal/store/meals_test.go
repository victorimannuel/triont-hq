package store

import (
	"math"
	"testing"
)

/*
The arithmetic that turns "two centong" into a number.

It is three multiplications and there is nothing clever in it, which is exactly
why it is worth a test: a food log is believed, and a quietly wrong total is
worse than no total at all. Nothing on screen would show the mistake.
*/

func closeTo(got, want float64) bool { return math.Abs(got-want) < 0.001 }

func TestItemTotalsMultiplyThroughGrams(t *testing.T) {
	// Rice: one centong is 100 g, and 100 g holds 130 kcal.
	rice := MealItem{Count: 2, Grams: 100, Kcal: 130, ProteinG: 2.7, CarbsG: 28, FatG: 0.3}
	got := rice.totals()

	if !closeTo(got.GramsG, 200) {
		t.Errorf("grams: got %v, want 200", got.GramsG)
	}
	if !closeTo(got.Kcal, 260) {
		t.Errorf("kcal: got %v, want 260", got.Kcal)
	}
	if !closeTo(got.ProteinG, 5.4) {
		t.Errorf("protein: got %v, want 5.4", got.ProteinG)
	}
	if !closeTo(got.CarbsG, 56) {
		t.Errorf("carbs: got %v, want 56", got.CarbsG)
	}
	if !closeTo(got.FatG, 0.6) {
		t.Errorf("fat: got %v, want 0.6", got.FatG)
	}
}

// A unit that is not 100 g is the normal case, not the exception — an egg is
// 60 g and a cracker is 5 — so the per-100 g step has to actually happen.
func TestItemTotalsHandleAUnitThatIsNotAHundredGrams(t *testing.T) {
	egg := MealItem{Count: 1, Grams: 60, Kcal: 196, ProteinG: 14}
	got := egg.totals()

	if !closeTo(got.GramsG, 60) {
		t.Errorf("grams: got %v, want 60", got.GramsG)
	}
	if !closeTo(got.Kcal, 117.6) {
		t.Errorf("kcal: got %v, want 117.6", got.Kcal)
	}
	if !closeTo(got.ProteinG, 8.4) {
		t.Errorf("protein: got %v, want 8.4", got.ProteinG)
	}
}

// Half a centong is a real answer, and the thing a person reaches for when
// correcting a guess.
func TestItemTotalsTakeAFraction(t *testing.T) {
	half := MealItem{Count: 0.5, Grams: 100, Kcal: 130}
	if got := half.totals(); !closeTo(got.Kcal, 65) {
		t.Errorf("kcal: got %v, want 65", got.Kcal)
	}
}

func TestItemTotalsAreNothingWhenNothingWasEaten(t *testing.T) {
	none := MealItem{Count: 0, Grams: 100, Kcal: 130}
	got := none.totals()
	if got.Kcal != 0 || got.GramsG != 0 {
		t.Errorf("got %+v, want zeroes", got)
	}
}

func TestNutritionAddsUp(t *testing.T) {
	var day Nutrition
	day.add(MealItem{Count: 2, Grams: 100, Kcal: 130, ProteinG: 2.7}.totals())
	day.add(MealItem{Count: 1, Grams: 60, Kcal: 196, ProteinG: 14}.totals())

	if !closeTo(day.Kcal, 377.6) {
		t.Errorf("kcal: got %v, want 377.6", day.Kcal)
	}
	if !closeTo(day.ProteinG, 13.8) {
		t.Errorf("protein: got %v, want 13.8", day.ProteinG)
	}
	if !closeTo(day.GramsG, 260) {
		t.Errorf("grams: got %v, want 260", day.GramsG)
	}
}
