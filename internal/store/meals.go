package store

import (
	"context"
	"strings"
	"time"
)

/*
Eating, counted.

The hard part of logging food is not the arithmetic, it is that nobody knows
what they ate in grams. So nothing here asks for grams. A food carries what one
of its own household units weighs — a centong of rice, a butir of egg, a potong
of tempe — and a meal is a list of those units with a count against each. The
count is the only thing a person has to judge, and it is the one thing they can
judge accurately while looking at the plate.

Everything else is multiplication, which is why the numbers can be trusted as
far as the food table is: correct a food once and every meal after it is right.
*/

// Food is one thing that gets eaten, described per household unit.
type Food struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// As it is said at the table: centong, butir, potong, gelas.
	Unit string `json:"unit"`
	// What one unit weighs. The whole model hangs off this.
	Grams float64 `json:"grams"`
	// Per 100 g, the way published food tables give them.
	Kcal      float64 `json:"kcal"`
	ProteinG  float64 `json:"protein_g"`
	CarbsG    float64 `json:"carbs_g"`
	FatG      float64 `json:"fat_g"`
	Notes     string  `json:"notes"`
	CreatedBy string  `json:"created_by"`
	UpdatedBy string  `json:"updated_by"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type FoodInput struct {
	Name     string  `json:"name"`
	Unit     string  `json:"unit"`
	Grams    float64 `json:"grams"`
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	CarbsG   float64 `json:"carbs_g"`
	FatG     float64 `json:"fat_g"`
	Notes    string  `json:"notes"`
}

const foodCols = `id, name, unit, grams, kcal, protein_g, carbs_g, fat_g, notes,
	created_by, updated_by, created_at, updated_at`

func scanFood(row interface{ Scan(...any) error }) (Food, error) {
	var f Food
	err := row.Scan(&f.ID, &f.Name, &f.Unit, &f.Grams, &f.Kcal, &f.ProteinG,
		&f.CarbsG, &f.FatG, &f.Notes, &f.CreatedBy, &f.UpdatedBy,
		&f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (s *Store) ListFoods(ctx context.Context, query string) ([]Food, error) {
	rows, err := s.pool.Query(ctx, `select `+foodCols+`
		  from foods
		 where deleted_at is null
		   and ($1 = '' or name ilike '%' || $1 || '%')
		 order by lower(name)`, strings.TrimSpace(query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Food{}
	for rows.Next() {
		food, err := scanFood(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, food)
	}
	return out, rows.Err()
}

func (s *Store) FoodByID(ctx context.Context, id int64) (Food, error) {
	food, err := scanFood(s.pool.QueryRow(ctx,
		`select `+foodCols+` from foods where id = $1 and deleted_at is null`, id))
	return food, norm(err)
}

func (s *Store) CreateFood(ctx context.Context, in FoodInput, actor string) (Food, error) {
	food, err := scanFood(s.pool.QueryRow(ctx, `
		insert into foods (name, unit, grams, kcal, protein_g, carbs_g, fat_g,
		                   notes, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
		returning `+foodCols,
		in.Name, in.Unit, in.Grams, in.Kcal, in.ProteinG, in.CarbsG, in.FatG,
		in.Notes, actor))
	return food, norm(err)
}

func (s *Store) UpdateFood(ctx context.Context, id int64, in FoodInput, actor string) (Food, error) {
	food, err := scanFood(s.pool.QueryRow(ctx, `
		update foods set name = $1, unit = $2, grams = $3, kcal = $4,
		       protein_g = $5, carbs_g = $6, fat_g = $7, notes = $8,
		       updated_by = $9, updated_at = now()
		 where id = $10 and deleted_at is null
		returning `+foodCols,
		in.Name, in.Unit, in.Grams, in.Kcal, in.ProteinG, in.CarbsG, in.FatG,
		in.Notes, actor, id))
	return food, norm(err)
}

func (s *Store) DeleteFood(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "foods", id, actor)
}

func (s *Store) RestoreFood(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "foods", id, actor)
}

/*
MealItem is one thing on the plate.

The nutrition is copied from the food rather than joined to it, because a log
is a record of what was true at the time. Fixing the calories of rice today
must not quietly rewrite every lunch that ever had rice in it — and the same
copy is what keeps a row readable after its food has been deleted.

The copy is taken when a meal is saved, which means saving an old meal again
re-takes it at today's numbers. That is deliberate and it is visible: the form
shows what it is about to write before it writes it. What is protected is
every meal nobody opened.
*/
type MealItem struct {
	ID     int64 `json:"id"`
	MealID int64 `json:"meal_id"`
	// Null once the food it came from has been deleted. The row survives.
	FoodID *int64  `json:"food_id"`
	Name   string  `json:"name"`
	Unit   string  `json:"unit"`
	Count  float64 `json:"count"`
	Grams  float64 `json:"grams"`
	// Per 100 g, frozen at the time it was eaten.
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	CarbsG   float64 `json:"carbs_g"`
	FatG     float64 `json:"fat_g"`
	// True while the count is still what a photo guessed rather than what a
	// person confirmed. A week of totals reads differently when half of it was
	// never looked at.
	Guessed  bool `json:"guessed"`
	Position int  `json:"position"`

	// What this item actually came to, so nothing downstream repeats the sum.
	Totals Nutrition `json:"totals"`
}

type MealItemInput struct {
	FoodID  *int64  `json:"food_id"`
	Name    string  `json:"name"`
	Count   float64 `json:"count"`
	Guessed bool    `json:"guessed"`
	// Set only for an item with no food behind it, where the numbers are the
	// person's own. Otherwise the food is the source and these are ignored.
	Unit     string  `json:"unit"`
	Grams    float64 `json:"grams"`
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	CarbsG   float64 `json:"carbs_g"`
	FatG     float64 `json:"fat_g"`
}

// Nutrition is a total, in the units a person reads rather than per 100 g.
type Nutrition struct {
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	CarbsG   float64 `json:"carbs_g"`
	FatG     float64 `json:"fat_g"`
	GramsG   float64 `json:"grams"`
}

func (n *Nutrition) add(o Nutrition) {
	n.Kcal += o.Kcal
	n.ProteinG += o.ProteinG
	n.CarbsG += o.CarbsG
	n.FatG += o.FatG
	n.GramsG += o.GramsG
}

// totals turns "two centong" into grams and then into what those grams hold.
func (i MealItem) totals() Nutrition {
	grams := i.Count * i.Grams
	per := grams / 100
	return Nutrition{
		Kcal:     i.Kcal * per,
		ProteinG: i.ProteinG * per,
		CarbsG:   i.CarbsG * per,
		FatG:     i.FatG * per,
		GramsG:   grams,
	}
}

// Meal is one sitting: breakfast, lunch, whatever was eaten standing up.
type Meal struct {
	ID      int64     `json:"id"`
	EatenAt time.Time `json:"eaten_at"`
	Kind    string    `json:"kind"`
	Notes   string     `json:"notes"`
	Items   []MealItem `json:"items"`
	// The photo, if there is one. An ordinary attachment, so it is encrypted
	// and backed up like every other file here.
	ImageID   *int64    `json:"image_id"`
	Totals    Nutrition `json:"totals"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MealInput struct {
	// RFC3339. Empty means now, which is what logging a meal usually means.
	EatenAt string          `json:"eaten_at"`
	Kind    string          `json:"kind"`
	Notes   string          `json:"notes"`
	Items   []MealItemInput `json:"items"`
}

const mealCols = `id, eaten_at, kind, notes, created_by, updated_by, created_at, updated_at,
	(select a.id from attachments a
	  where a.entity = 'meal' and a.entity_id = meals.id
	    and a.deleted_at is null
	    and a.mime_type like 'image/%'
	  order by a.position, a.created_at, a.id limit 1) as image_id`

func scanMeal(row interface{ Scan(...any) error }) (Meal, error) {
	var m Meal
	err := row.Scan(&m.ID, &m.EatenAt, &m.Kind, &m.Notes, &m.CreatedBy,
		&m.UpdatedBy, &m.CreatedAt, &m.UpdatedAt, &m.ImageID)
	return m, err
}

/*
MealsOn is one day's eating, newest sitting first.

The day is taken as the caller's, not the server's: a meal at half past
midnight belongs to the night it was part of only if the phone says so, and the
phone is the thing that knows which day the person thinks it is.
*/
func (s *Store) MealsOn(ctx context.Context, day time.Time) ([]Meal, error) {
	from := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	rows, err := s.pool.Query(ctx, `select `+mealCols+`
		  from meals
		 where deleted_at is null and eaten_at >= $1 and eaten_at < $2
		 order by eaten_at desc, id desc`, from, from.AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	meals := []Meal{}
	ids := []int64{}
	for rows.Next() {
		meal, err := scanMeal(rows)
		if err != nil {
			return nil, err
		}
		meals = append(meals, meal)
		ids = append(ids, meal.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return s.withItems(ctx, meals, ids)
}

func (s *Store) MealByID(ctx context.Context, id int64) (Meal, error) {
	meal, err := scanMeal(s.pool.QueryRow(ctx,
		`select `+mealCols+` from meals where id = $1 and deleted_at is null`, id))
	if err != nil {
		return Meal{}, norm(err)
	}
	filled, err := s.withItems(ctx, []Meal{meal}, []int64{meal.ID})
	if err != nil {
		return Meal{}, err
	}
	return filled[0], nil
}

// withItems fills in what was on each plate in one query rather than one per
// meal, and adds up the totals on the way past.
func (s *Store) withItems(ctx context.Context, meals []Meal, ids []int64) ([]Meal, error) {
	for i := range meals {
		meals[i].Items = []MealItem{}
	}
	if len(ids) == 0 {
		return meals, nil
	}

	rows, err := s.pool.Query(ctx, `
		select id, meal_id, food_id, name, unit, count, grams,
		       kcal, protein_g, carbs_g, fat_g, guessed, position
		  from meal_items
		 where meal_id = any($1)
		 order by meal_id, position, id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	at := map[int64]int{}
	for i, meal := range meals {
		at[meal.ID] = i
	}

	for rows.Next() {
		var item MealItem
		if err := rows.Scan(&item.ID, &item.MealID, &item.FoodID, &item.Name,
			&item.Unit, &item.Count, &item.Grams, &item.Kcal, &item.ProteinG,
			&item.CarbsG, &item.FatG, &item.Guessed, &item.Position); err != nil {
			return nil, err
		}
		item.Totals = item.totals()
		i, ok := at[item.MealID]
		if !ok {
			continue
		}
		meals[i].Items = append(meals[i].Items, item)
		meals[i].Totals.add(item.Totals)
	}
	return meals, rows.Err()
}

// DayTotal is one day's worth, for the strip that shows the last week.
type DayTotal struct {
	On     string    `json:"on"`
	Totals Nutrition `json:"totals"`
	Meals  int       `json:"meals"`
}

/*
DayTotals is the last so many days, oldest first, with the days nothing was
logged on included as zeroes.

The blanks matter: a week with three gaps in it is a week the log was not kept,
and a chart that quietly closed the gaps would read as a week of fasting.
*/
func (s *Store) DayTotals(ctx context.Context, through time.Time, days int) ([]DayTotal, error) {
	if days <= 0 || days > 90 {
		days = 7
	}
	last := time.Date(through.Year(), through.Month(), through.Day(), 0, 0, 0, 0, through.Location())
	first := last.AddDate(0, 0, -(days - 1))

	rows, err := s.pool.Query(ctx, `
		select m.eaten_at, i.count, i.grams, i.kcal, i.protein_g, i.carbs_g, i.fat_g, m.id
		  from meals m left join meal_items i on i.meal_id = m.id
		 where m.deleted_at is null and m.eaten_at >= $1 and m.eaten_at < $2`,
		first, last.AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	totals := map[string]*DayTotal{}
	seen := map[string]map[int64]bool{}
	for rows.Next() {
		var eaten time.Time
		var mealID int64
		var item MealItem
		var count, grams, kcal, protein, carbs, fat *float64
		if err := rows.Scan(&eaten, &count, &grams, &kcal, &protein, &carbs, &fat, &mealID); err != nil {
			return nil, err
		}
		key := eaten.In(through.Location()).Format("2006-01-02")
		if totals[key] == nil {
			totals[key] = &DayTotal{On: key}
			seen[key] = map[int64]bool{}
		}
		if !seen[key][mealID] {
			seen[key][mealID] = true
			totals[key].Meals++
		}
		// A meal with nothing on it yet still counts as a meal; it just has
		// no numbers to add.
		if count == nil {
			continue
		}
		item = MealItem{Count: *count, Grams: *grams, Kcal: *kcal,
			ProteinG: *protein, CarbsG: *carbs, FatG: *fat}
		totals[key].Totals.add(item.totals())
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]DayTotal, 0, days)
	for d := first; !d.After(last); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if got := totals[key]; got != nil {
			out = append(out, *got)
			continue
		}
		out = append(out, DayTotal{On: key})
	}
	return out, nil
}

func (s *Store) CreateMeal(ctx context.Context, in MealInput, actor string) (Meal, error) {
	eaten, err := parseMoment(in.EatenAt)
	if err != nil {
		return Meal{}, err
	}
	var id int64
	if err := s.pool.QueryRow(ctx, `
		insert into meals (eaten_at, kind, notes, created_by, updated_by)
		values ($1, $2, $3, $4, $4) returning id`,
		eaten, in.Kind, in.Notes, actor).Scan(&id); err != nil {
		return Meal{}, err
	}
	if err := s.setMealItems(ctx, id, in.Items); err != nil {
		return Meal{}, err
	}
	return s.MealByID(ctx, id)
}

func (s *Store) UpdateMeal(ctx context.Context, id int64, in MealInput, actor string) (Meal, error) {
	eaten, err := parseMoment(in.EatenAt)
	if err != nil {
		return Meal{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update meals set eaten_at = $1, kind = $2, notes = $3,
		       updated_by = $4, updated_at = now()
		 where id = $5 and deleted_at is null`,
		eaten, in.Kind, in.Notes, actor, id)
	if err != nil {
		return Meal{}, err
	}
	if tag.RowsAffected() == 0 {
		return Meal{}, ErrNotFound
	}
	if err := s.setMealItems(ctx, id, in.Items); err != nil {
		return Meal{}, err
	}
	return s.MealByID(ctx, id)
}

/*
setMealItems replaces the plate wholesale.

Editing a meal means saying what was on it, not patching a list row by row —
there is no history inside one sitting worth keeping, and rewriting the lot is
both simpler and impossible to get half-done.

Each item's numbers are read from the food as it stands now and written into
the row, which is the moment the copy is taken.
*/
func (s *Store) setMealItems(ctx context.Context, mealID int64, items []MealItemInput) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `delete from meal_items where meal_id = $1`, mealID); err != nil {
		return err
	}

	for position, in := range items {
		name, unit := strings.TrimSpace(in.Name), strings.TrimSpace(in.Unit)
		grams, kcal := in.Grams, in.Kcal
		protein, carbs, fat := in.ProteinG, in.CarbsG, in.FatG

		if in.FoodID != nil {
			food, err := s.FoodByID(ctx, *in.FoodID)
			if err != nil {
				return err
			}
			// The food is the source of truth for everything but the count.
			name, unit = food.Name, food.Unit
			grams, kcal = food.Grams, food.Kcal
			protein, carbs, fat = food.ProteinG, food.CarbsG, food.FatG
		}
		if grams <= 0 {
			grams = 100
		}

		if _, err := tx.Exec(ctx, `
			insert into meal_items (meal_id, food_id, name, unit, count, grams,
			                        kcal, protein_g, carbs_g, fat_g, guessed, position)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			mealID, in.FoodID, name, unit, in.Count, grams,
			kcal, protein, carbs, fat, in.Guessed, position); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) DeleteMeal(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "meals", id, actor)
}

func (s *Store) RestoreMeal(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "meals", id, actor)
}

// parseMoment reads a timestamp off the wire. Empty means now, because logging
// a meal almost always means the one just eaten.
func parseMoment(v string) (time.Time, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Now(), nil
	}
	return time.Parse(time.RFC3339, v)
}
