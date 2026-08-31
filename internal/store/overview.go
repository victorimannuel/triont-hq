package store

import (
	"context"
	"slices"
)

// Totals is every headline number the home page shows. They used to be nine
// separate round trips to answer one screen; counting is cheap and the trips
// were not, so they are one statement now.
type Totals struct {
	Credentials int `json:"total_credentials"`
	Assets      int `json:"total_assets"`
	Clients     int `json:"total_clients"`
	Documents   int `json:"total_documents"`
	Belongings  int `json:"total_belongings"`
	People      int `json:"total_people"`
	Income      int `json:"total_income"`
	Expenses    int `json:"total_expenses"`
	Supplies    int `json:"total_supplies"`
}

// Every branch filters out soft-deleted rows. People are all the contacts,
// with or without a client, because that is what the people page lists.
const totalsSQL = `
select
  (select count(*) from credentials    where deleted_at is null),
  (select count(*) from assets         where deleted_at is null),
  (select count(*) from clients        where deleted_at is null),
  (select count(*) from documents      where deleted_at is null),
  (select count(*) from belongings     where deleted_at is null),
  (select count(*) from contacts       where deleted_at is null),
  (select count(*) from income_streams  where deleted_at is null),
  (select count(*) from expense_streams where deleted_at is null),
  (select count(*) from supplies        where deleted_at is null)`

func (s *Store) Totals(ctx context.Context) (Totals, error) {
	var t Totals
	err := s.pool.QueryRow(ctx, totalsSQL).Scan(
		&t.Credentials, &t.Assets, &t.Clients, &t.Documents,
		&t.Belongings, &t.People, &t.Income, &t.Expenses, &t.Supplies)
	return t, err
}

// Overview is everything the home page needs, gathered in one place so the
// handler has one error to check rather than a dozen.
type Overview struct {
	Totals
	// Only used to add up TotalProjects; the page shows the total, not the
	// split.
	StatusCounts  map[string]int  `json:"-"`
	TotalProjects int             `json:"total_projects"`
	Recent        []Project       `json:"recent"`
	Upcoming      []CalendarEntry `json:"upcoming"`
	// What has run out, and what is broken. Both are short by nature and both
	// are read to decide what to do next, so they travel whole rather than as
	// counts the page would have to fetch again to explain.
	LowSupplies    []Supply           `json:"low_supplies"`
	Trouble        []Check            `json:"trouble"`
	StaleMonitors  []Monitor          `json:"stale_monitors"`
	MonthlyIncome  map[string]float64 `json:"monthly_income"`
	MonthlyExpense map[string]float64 `json:"monthly_expense"`
	Rates          []FxRate           `json:"rates"`
}

// How far ahead each kind of deadline is worth worrying about. A domain can be
// renewed in an afternoon; a passport cannot, so it gets a longer runway.
const (
	// A month, which the page narrows to a week when asked. Anything further
	// out is the calendar's job: a home page that mixes "besok" with "tiga
	// bulan lagi" stops being a to-do list.
	upcomingWindowDays = 30
	// Generous enough that the month view is never quietly cut short, and
	// still a bound.
	upcomingRows = 60
	recentProjects     = 8
)

func (s *Store) Overview(ctx context.Context) (Overview, error) {
	var o Overview
	var err error

	if o.Totals, err = s.Totals(ctx); err != nil {
		return o, err
	}
	if o.StatusCounts, err = s.StatusCounts(ctx); err != nil {
		return o, err
	}
	for _, n := range o.StatusCounts {
		o.TotalProjects += n
	}

	projects, err := s.ListProjects(ctx, ProjectFilter{})
	if err != nil {
		return o, err
	}
	// ListProjects orders by name, which is right for the list page and wrong
	// for a section called "terakhir disentuh".
	slices.SortFunc(projects, func(a, b Project) int {
		return b.UpdatedAt.Compare(a.UpdatedAt)
	})
	if len(projects) > recentProjects {
		projects = projects[:recentProjects]
	}
	o.Recent = projects

	// A birthday, a domain renewal and a passport running out are the same
	// fact — something falls due on a day — so the page gets one list of them
	// rather than a section per module.
	if o.Upcoming, err = s.DueWithin(ctx, upcomingWindowDays); err != nil {
		return o, err
	}
	if len(o.Upcoming) > upcomingRows {
		o.Upcoming = o.Upcoming[:upcomingRows]
	}
	if o.LowSupplies, err = s.LowSupplies(ctx); err != nil {
		return o, err
	}
	if o.Trouble, err = s.Trouble(ctx); err != nil {
		return o, err
	}
	if o.StaleMonitors, err = s.StaleMonitors(ctx); err != nil {
		return o, err
	}
	if o.MonthlyIncome, err = s.MonthlyIncome(ctx); err != nil {
		return o, err
	}
	if o.MonthlyExpense, err = s.MonthlyExpense(ctx); err != nil {
		return o, err
	}
	if o.Rates, err = s.Rates(ctx); err != nil {
		return o, err
	}
	return o, nil
}
