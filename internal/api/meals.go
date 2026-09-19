package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/victorimannuel/triont-hq/internal/store"
)

// The food table and the log that reads from it. Two modules that only make
// sense together: a meal is a list of counts, and the table is what turns a
// count into a number.

func (s *Server) handleListFoods(w http.ResponseWriter, r *http.Request) {
	foods, err := s.store.ListFoods(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"foods": foods})
}

func (s *Server) readFood(r *http.Request) (store.FoodInput, string) {
	var in store.FoodInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Name = trim(in.Name)
	if in.Name == "" {
		return in, "nama makanannya wajib diisi"
	}
	in.Unit = trim(in.Unit)
	if in.Unit == "" {
		in.Unit = "porsi"
	}
	// Zero grams would make every meal of this food come to nothing, which
	// is a wrong answer that looks like a working one.
	if in.Grams <= 0 {
		return in, "berat per satuan harus lebih dari nol"
	}
	if in.Kcal < 0 || in.ProteinG < 0 || in.CarbsG < 0 || in.FatG < 0 {
		return in, "gizinya nggak boleh minus"
	}
	in.Notes = trim(in.Notes)
	return in, ""
}

func (s *Server) handleCreateFood(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readFood(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	food, err := s.store.CreateFood(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, food)
}

func (s *Server) handleUpdateFood(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readFood(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	food, err := s.store.UpdateFood(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, food)
}

func (s *Server) handleDeleteFood(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteFood(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

/*
handleListMeals is one day plus the week behind it.

Both in one reply because the page shows both and neither is worth a second
round trip: today's plates, and the strip of totals that says whether today is
unusual.
*/
func (s *Server) handleListMeals(w http.ResponseWriter, r *http.Request) {
	day, err := dayFrom(r.URL.Query().Get("on"))
	if err != nil {
		fail(w, http.StatusBadRequest, "tanggalnya harus format YYYY-MM-DD")
		return
	}

	meals, err := s.store.MealsOn(r.Context(), day)
	if err != nil {
		s.oops(w, err)
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days == 0 {
		days = 7
	}
	week, err := s.store.DayTotals(r.Context(), day, days)
	if err != nil {
		s.oops(w, err)
		return
	}

	var totals store.Nutrition
	for _, meal := range meals {
		totals.Kcal += meal.Totals.Kcal
		totals.ProteinG += meal.Totals.ProteinG
		totals.CarbsG += meal.Totals.CarbsG
		totals.FatG += meal.Totals.FatG
		totals.GramsG += meal.Totals.GramsG
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"on":     day.Format("2006-01-02"),
		"meals":  meals,
		"totals": totals,
		"days":   week,
	})
}

// dayFrom reads the day off the query string, defaulting to today. The client
// sends its own date so a meal at half past midnight lands on the day the
// person thinks it is.
func dayFrom(value string) (time.Time, error) {
	value = trim(value)
	if value == "" {
		return time.Now(), nil
	}
	return time.ParseInLocation("2006-01-02", value, time.Local)
}

func (s *Server) handleGetMeal(w http.ResponseWriter, r *http.Request) {
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
	writeJSON(w, http.StatusOK, meal)
}

func (s *Server) readMeal(r *http.Request) (store.MealInput, string) {
	var in store.MealInput
	if err := readJSON(r, &in); err != nil {
		return in, "isian nggak kebaca"
	}
	in.Kind = valid(mealKinds, in.Kind, "other")
	in.Notes = trim(in.Notes)
	in.EatenAt = trim(in.EatenAt)
	if in.EatenAt != "" {
		if _, err := time.Parse(time.RFC3339, in.EatenAt); err != nil {
			return in, "waktunya nggak kebaca"
		}
	}
	for i := range in.Items {
		in.Items[i].Name = trim(in.Items[i].Name)
		if in.Items[i].Count < 0 {
			return in, "jumlahnya nggak boleh minus"
		}
		// An item with neither a food behind it nor a name of its own is a
		// blank row, and a blank row in a food log is noise.
		if in.Items[i].FoodID == nil && in.Items[i].Name == "" {
			return in, "tiap baris harus punya makanan atau nama sendiri"
		}
	}
	return in, ""
}

func (s *Server) handleCreateMeal(w http.ResponseWriter, r *http.Request) {
	in, msg := s.readMeal(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	meal, err := s.store.CreateMeal(r.Context(), in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, meal)
}

func (s *Server) handleUpdateMeal(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	in, msg := s.readMeal(r)
	if msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	meal, err := s.store.UpdateMeal(r.Context(), id, in, actor(r))
	if err != nil {
		s.oops(w, err)
		return
	}
	writeJSON(w, http.StatusOK, meal)
}

func (s *Server) handleDeleteMeal(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, http.StatusBadRequest, "id nggak valid")
		return
	}
	if err := s.store.DeleteMeal(r.Context(), id, actor(r)); err != nil {
		s.oops(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
