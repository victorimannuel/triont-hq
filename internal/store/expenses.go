package store

import (
	"context"
	"strings"
	"time"
)

// ExpenseStream is money going out on a schedule: salaries, subscriptions,
// instalments, electricity. An asset that costs money is one of these too, so
// the list mixes in rows derived from assets; Source says which is which.
type ExpenseStream struct {
	ID          int64      `json:"id"`
	Source      string     `json:"source"`
	Name        string     `json:"name"`
	Category    string     `json:"category"`
	ProjectID   *int64     `json:"project_id"`
	ProjectName string     `json:"project_name"`
	ProjectSlug string     `json:"project_slug"`
	AssetID     *int64     `json:"asset_id"`
	AssetName   string     `json:"asset_name"`
	Amount      float64    `json:"amount"`
	Currency    string     `json:"currency"`
	Cycle       string     `json:"cycle"`
	Status      string     `json:"status"`
	StartedOn   *time.Time `json:"started_on"`
	EndedOn     *time.Time `json:"ended_on"`
	NextDueOn   *time.Time `json:"next_due_on"`
	Notes       string     `json:"notes"`
	CreatedBy   string     `json:"created_by"`
	UpdatedBy   string     `json:"updated_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type ExpenseInput struct {
	Name      string  `json:"name"`
	Category  string  `json:"category"`
	ProjectID *int64  `json:"project_id"`
	AssetID   *int64  `json:"asset_id"`
	Amount    float64 `json:"amount"`
	Currency  string  `json:"currency"`
	Cycle     string  `json:"cycle"`
	Status    string  `json:"status"`
	StartedOn string  `json:"started_on"`
	EndedOn   string  `json:"ended_on"`
	NextDueOn string  `json:"next_due_on"`
	Notes     string  `json:"notes"`
}

type ExpenseFilter struct {
	Status   string
	Category string
	Query    string
}

const expenseCols = `e.id, e.name, e.category, e.project_id,
	coalesce(p.name, ''), coalesce(p.slug, ''), e.asset_id, coalesce(a.name, ''),
	e.amount, e.currency, e.cycle, e.status, e.started_on, e.ended_on, e.next_due_on,
	e.notes, e.created_by, e.updated_by, e.created_at, e.updated_at`

const expenseFrom = ` from expense_streams e
	left join projects p on p.id = e.project_id and p.deleted_at is null
	left join assets a on a.id = e.asset_id`

func scanExpense(row interface{ Scan(...any) error }) (ExpenseStream, error) {
	var s ExpenseStream
	err := row.Scan(&s.ID, &s.Name, &s.Category, &s.ProjectID, &s.ProjectName, &s.ProjectSlug,
		&s.AssetID, &s.AssetName,
		&s.Amount, &s.Currency, &s.Cycle, &s.Status, &s.StartedOn, &s.EndedOn,
		&s.NextDueOn, &s.Notes, &s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	s.Source = "expense"
	return s, err
}

// AssetExpenses turns every paid asset that no expense row claims into a
// read-only expense line, so the outgoings page shows the whole picture
// without anything having to be typed twice.
func (st *Store) AssetExpenses(ctx context.Context, f ExpenseFilter) ([]ExpenseStream, error) {
	if f.Status != "" && f.Status != "active" {
		return nil, nil
	}
	if f.Category != "" && f.Category != "asset" {
		return nil, nil
	}

	rows, err := st.pool.Query(ctx, `
		select a.id, a.name, a.kind, a.cost_amount, a.cost_currency, a.billing_cycle,
		       a.renews_on, a.notes, a.created_at, a.updated_at
		  from assets a
		 where a.status = 'active'
		   and a.cost_amount > 0
		   and not exists (
		         select 1 from expense_streams e
		          where e.asset_id = a.id and e.deleted_at is null)
		   and ($1 = '' or a.name ilike '%' || $1 || '%')
		 order by lower(a.name)`, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ExpenseStream{}
	for rows.Next() {
		var s ExpenseStream
		var id int64
		var kind string
		if err := rows.Scan(&id, &s.Name, &kind, &s.Amount, &s.Currency, &s.Cycle,
			&s.NextDueOn, &s.Notes, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		s.ID = id
		s.AssetID = &id
		s.AssetName = s.Name
		s.Source = "asset"
		s.Category = "asset"
		s.Status = "active"
		out = append(out, s)
	}
	return out, rows.Err()
}

func (st *Store) ListExpenses(ctx context.Context, f ExpenseFilter) ([]ExpenseStream, error) {
	rows, err := st.pool.Query(ctx, `select `+expenseCols+expenseFrom+`
		where e.deleted_at is null
		  and ($1 = '' or e.status = $1)
		  and ($2 = '' or e.category = $2)
		  and ($3 = '' or e.name ilike '%' || $3 || '%' or p.name ilike '%' || $3 || '%')
		-- Sorted by name so a thing is always where you last saw it. Status
		-- and dates are filters and badges; they do not get to move the rows
		-- around underneath you.
		order by lower(e.name)`,
		f.Status, f.Category, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ExpenseStream{}
	for rows.Next() {
		s, err := scanExpense(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (st *Store) ExpenseByID(ctx context.Context, id int64) (ExpenseStream, error) {
	s, err := scanExpense(st.pool.QueryRow(ctx,
		`select `+expenseCols+expenseFrom+` where e.id = $1 and e.deleted_at is null`, id))
	return s, norm(err)
}

func (st *Store) CreateExpense(ctx context.Context, in ExpenseInput, actor string) (ExpenseStream, error) {
	started, ended, next, err := st.expenseDates(in)
	if err != nil {
		return ExpenseStream{}, err
	}
	var id int64
	err = st.pool.QueryRow(ctx, `
		insert into expense_streams (name, category, project_id, asset_id, amount, currency,
		                             cycle, status, started_on, ended_on, next_due_on, notes,
		                             created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
		returning id`,
		in.Name, in.Category, in.ProjectID, in.AssetID, in.Amount, in.Currency, in.Cycle,
		in.Status, started, ended, next, in.Notes, actor).Scan(&id)
	if err != nil {
		return ExpenseStream{}, norm(err)
	}
	return st.ExpenseByID(ctx, id)
}

func (st *Store) UpdateExpense(ctx context.Context, id int64, in ExpenseInput, actor string) (ExpenseStream, error) {
	started, ended, next, err := st.expenseDates(in)
	if err != nil {
		return ExpenseStream{}, err
	}
	tag, err := st.pool.Exec(ctx, `
		update expense_streams set name = $1, category = $2, project_id = $3, asset_id = $4,
		       amount = $5, currency = $6, cycle = $7, status = $8, started_on = $9,
		       ended_on = $10, next_due_on = $11, notes = $12, updated_by = $13,
		       updated_at = now()
		 where id = $14 and deleted_at is null`,
		in.Name, in.Category, in.ProjectID, in.AssetID, in.Amount, in.Currency, in.Cycle,
		in.Status, started, ended, next, in.Notes, actor, id)
	if err != nil {
		return ExpenseStream{}, err
	}
	if tag.RowsAffected() == 0 {
		return ExpenseStream{}, ErrNotFound
	}
	return st.ExpenseByID(ctx, id)
}

func (st *Store) expenseDates(in ExpenseInput) (*time.Time, *time.Time, *time.Time, error) {
	started, err := parseDate(in.StartedOn)
	if err != nil {
		return nil, nil, nil, err
	}
	ended, err := parseDate(in.EndedOn)
	if err != nil {
		return nil, nil, nil, err
	}
	next, err := parseDate(in.NextDueOn)
	if err != nil {
		return nil, nil, nil, err
	}
	return started, ended, next, nil
}

func (st *Store) DeleteExpense(ctx context.Context, id int64, actor string) error {
	return st.softDeleteByID(ctx, "expense_streams", id, actor)
}

func (st *Store) RestoreExpense(ctx context.Context, id int64, actor string) error {
	return st.restore(ctx, "expense_streams", id, actor)
}

// MonthlyExpense counts the rows typed in by hand plus every paid asset that
// no expense row claims — the same set the outgoings list shows.
func (st *Store) MonthlyExpense(ctx context.Context) (map[string]float64, error) {
	out, err := st.monthlyByCurrency(ctx, "expense_streams")
	if err != nil {
		return nil, err
	}

	rows, err := st.pool.Query(ctx, `
		select a.cost_currency, coalesce(sum(
		    case a.billing_cycle
		      when 'monthly'   then a.cost_amount
		      when 'quarterly' then a.cost_amount / 3
		      when 'yearly'    then a.cost_amount / 12
		      else 0
		    end), 0)
		  from assets a
		 where a.status = 'active'
		   and a.cost_amount > 0
		   and not exists (
		         select 1 from expense_streams e
		          where e.asset_id = a.id and e.deleted_at is null)
		 group by a.cost_currency`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var currency string
		var amount float64
		if err := rows.Scan(&currency, &amount); err != nil {
			return nil, err
		}
		if amount > 0 {
			out[currency] += amount
		}
	}
	return out, rows.Err()
}

func (st *Store) CountExpenses(ctx context.Context) (int, error) {
	var n int
	err := st.pool.QueryRow(ctx,
		`select count(*) from expense_streams where deleted_at is null`).Scan(&n)
	return n, err
}
