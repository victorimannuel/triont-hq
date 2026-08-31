package store

import (
	"context"
	"strings"
	"time"
)

// IncomeStream is money coming in on a schedule: a retainer, rent you collect,
// a client's subscription. It can hang off a client, a project, both, or
// neither — some income does not belong to any project at all.
type IncomeStream struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	ClientID    *int64     `json:"client_id"`
	ClientName  string     `json:"client_name"`
	ClientSlug  string     `json:"client_slug"`
	ProjectID   *int64     `json:"project_id"`
	ProjectName string     `json:"project_name"`
	ProjectSlug string     `json:"project_slug"`
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

type IncomeInput struct {
	Name      string  `json:"name"`
	ClientID  *int64  `json:"client_id"`
	ProjectID *int64  `json:"project_id"`
	Amount    float64 `json:"amount"`
	Currency  string  `json:"currency"`
	Cycle     string  `json:"cycle"`
	Status    string  `json:"status"`
	StartedOn string  `json:"started_on"`
	EndedOn   string  `json:"ended_on"`
	NextDueOn string  `json:"next_due_on"`
	Notes     string  `json:"notes"`
}

type IncomeFilter struct {
	Status  string
	Client  string
	Project string
	Query   string
}

const incomeCols = `i.id, i.name, i.client_id, coalesce(c.name, ''), coalesce(c.slug, ''),
	i.project_id, coalesce(p.name, ''), coalesce(p.slug, ''),
	i.amount, i.currency, i.cycle, i.status, i.started_on, i.ended_on, i.next_due_on,
	i.notes, i.created_by, i.updated_by, i.created_at, i.updated_at`

const incomeFrom = ` from income_streams i
	left join clients c on c.id = i.client_id and c.deleted_at is null
	left join projects p on p.id = i.project_id and p.deleted_at is null`

func scanIncome(row interface{ Scan(...any) error }) (IncomeStream, error) {
	var s IncomeStream
	err := row.Scan(&s.ID, &s.Name, &s.ClientID, &s.ClientName, &s.ClientSlug,
		&s.ProjectID, &s.ProjectName, &s.ProjectSlug,
		&s.Amount, &s.Currency, &s.Cycle, &s.Status, &s.StartedOn, &s.EndedOn,
		&s.NextDueOn, &s.Notes, &s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (st *Store) ListIncome(ctx context.Context, f IncomeFilter) ([]IncomeStream, error) {
	rows, err := st.pool.Query(ctx, `select `+incomeCols+incomeFrom+`
		where i.deleted_at is null
		  and ($1 = '' or i.status = $1)
		  and ($2 = '' or c.slug = $2)
		  and ($3 = '' or p.slug = $3)
		  and ($4 = '' or i.name ilike '%' || $4 || '%'
		                or c.name ilike '%' || $4 || '%'
		                or p.name ilike '%' || $4 || '%')
		-- Sorted by name so a thing is always where you last saw it. Status
		-- and dates are filters and badges; they do not get to move the rows
		-- around underneath you.
		order by lower(i.name)`,
		f.Status, f.Client, f.Project, strings.TrimSpace(f.Query))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []IncomeStream{}
	for rows.Next() {
		s, err := scanIncome(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (st *Store) IncomeByID(ctx context.Context, id int64) (IncomeStream, error) {
	s, err := scanIncome(st.pool.QueryRow(ctx,
		`select `+incomeCols+incomeFrom+` where i.id = $1 and i.deleted_at is null`, id))
	return s, norm(err)
}

func (st *Store) CreateIncome(ctx context.Context, in IncomeInput, actor string) (IncomeStream, error) {
	started, err := parseDate(in.StartedOn)
	if err != nil {
		return IncomeStream{}, err
	}
	ended, err := parseDate(in.EndedOn)
	if err != nil {
		return IncomeStream{}, err
	}
	next, err := parseDate(in.NextDueOn)
	if err != nil {
		return IncomeStream{}, err
	}

	var id int64
	err = st.pool.QueryRow(ctx, `
		insert into income_streams (name, client_id, project_id, amount, currency, cycle,
		                            status, started_on, ended_on, next_due_on, notes,
		                            created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
		returning id`,
		in.Name, in.ClientID, in.ProjectID, in.Amount, in.Currency, in.Cycle,
		in.Status, started, ended, next, in.Notes, actor).Scan(&id)
	if err != nil {
		return IncomeStream{}, norm(err)
	}
	return st.IncomeByID(ctx, id)
}

func (st *Store) UpdateIncome(ctx context.Context, id int64, in IncomeInput, actor string) (IncomeStream, error) {
	started, err := parseDate(in.StartedOn)
	if err != nil {
		return IncomeStream{}, err
	}
	ended, err := parseDate(in.EndedOn)
	if err != nil {
		return IncomeStream{}, err
	}
	next, err := parseDate(in.NextDueOn)
	if err != nil {
		return IncomeStream{}, err
	}

	tag, err := st.pool.Exec(ctx, `
		update income_streams set name = $1, client_id = $2, project_id = $3, amount = $4,
		       currency = $5, cycle = $6, status = $7, started_on = $8, ended_on = $9,
		       next_due_on = $10, notes = $11, updated_by = $12, updated_at = now()
		 where id = $13 and deleted_at is null`,
		in.Name, in.ClientID, in.ProjectID, in.Amount, in.Currency, in.Cycle,
		in.Status, started, ended, next, in.Notes, actor, id)
	if err != nil {
		return IncomeStream{}, err
	}
	if tag.RowsAffected() == 0 {
		return IncomeStream{}, ErrNotFound
	}
	return st.IncomeByID(ctx, id)
}

func (st *Store) DeleteIncome(ctx context.Context, id int64, actor string) error {
	return st.softDeleteByID(ctx, "income_streams", id, actor)
}

func (st *Store) RestoreIncome(ctx context.Context, id int64, actor string) error {
	return st.restore(ctx, "income_streams", id, actor)
}

func (st *Store) IncomeForProject(ctx context.Context, projectID int64) ([]IncomeStream, error) {
	rows, err := st.pool.Query(ctx, `select `+incomeCols+incomeFrom+`
		where i.deleted_at is null and i.project_id = $1
		order by lower(i.name)`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []IncomeStream{}
	for rows.Next() {
		s, err := scanIncome(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MonthlyByCurrency returns one figure per currency. Summing across
// currencies would need an exchange rate the app does not have, and a total
// that silently drops every non-IDR stream is worse than no total.
func (st *Store) monthlyByCurrency(ctx context.Context, table string) (map[string]float64, error) {
	rows, err := st.pool.Query(ctx, `
		select currency, coalesce(sum(
		    case cycle
		      when 'monthly'   then amount
		      when 'quarterly' then amount / 3
		      when 'yearly'    then amount / 12
		      else 0
		    end), 0)
		  from `+table+`
		 where deleted_at is null and status = 'active'
		 group by currency
		 having coalesce(sum(
		    case cycle
		      when 'monthly'   then amount
		      when 'quarterly' then amount / 3
		      when 'yearly'    then amount / 12
		      else 0
		    end), 0) > 0
		 order by currency`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]float64{}
	for rows.Next() {
		var currency string
		var amount float64
		if err := rows.Scan(&currency, &amount); err != nil {
			return nil, err
		}
		out[currency] = amount
	}
	return out, rows.Err()
}

func (st *Store) MonthlyIncome(ctx context.Context) (map[string]float64, error) {
	return st.monthlyByCurrency(ctx, "income_streams")
}
