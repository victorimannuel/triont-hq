package store

import (
	"context"
	"time"
)

/*
Budgeting: what a month's money was promised to, and whether that has happened
yet.

The unit here is an allocation, not a purchase. "Monthly Eats, 600k, Wants" is
decided once at the start of the month and then either done or not — which is
how the spreadsheet this replaces worked, and the only shape anybody keeps up.
Nothing in here wants to know about a cup of coffee.
*/

// The four things money can be for. Fixed rather than editable: the whole
// point of the split is that it does not move, and a fifth bucket is nearly
// always a Want being argued with.
var BudgetBuckets = []string{"needs", "wants", "savings", "debt"}

type MoneyAccount struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Balance   float64   `json:"balance"`
	Currency  string    `json:"currency"`
	Position  int       `json:"position"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MoneyAccountInput struct {
	Name     string  `json:"name"`
	Balance  float64 `json:"balance"`
	Currency string  `json:"currency"`
	Notes    string  `json:"notes"`
}

type BudgetLine struct {
	ID        int64  `json:"id"`
	OnMonth   string `json:"on_month"`
	Name      string `json:"name"`
	AccountID *int64 `json:"account_id"`
	// Filled in from the join, so a line can name its account without the page
	// having to look it up.
	AccountName string `json:"account_name"`
	Bucket      string `json:"bucket"`
	/*
		What this line is worth this month. For a line given as a share it is
		worked out from the month's income rather than read from the column, so
		a raise moves every percentage line without any of them being edited.
	*/
	Amount float64 `json:"amount"`
	// Null unless the line was given as a share of income.
	Percent *float64 `json:"percent"`
	Paid    bool     `json:"paid"`
	// The day it falls due, as YYYY-MM-DD, or empty when it is just "some time
	// this month".
	DueOn     string    `json:"due_on"`
	ExpenseID *int64    `json:"expense_id"`
	Position  int       `json:"position"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type BudgetLineInput struct {
	Name      string   `json:"name"`
	AccountID *int64   `json:"account_id"`
	Bucket    string   `json:"bucket"`
	Amount    float64  `json:"amount"`
	Percent   *float64 `json:"percent"`
	DueOn     string   `json:"due_on"`
	Notes     string   `json:"notes"`
}

// How one bucket came out, against what it was meant to be.
type BucketRoll struct {
	Bucket string `json:"bucket"`
	// What the lines in it add up to, and that as a share of income.
	Amount  float64 `json:"amount"`
	Percent float64 `json:"percent"`
	// What it was meant to be. Zero when no target has been set, which the
	// page reads as "no opinion" rather than as "should be nothing".
	Target float64 `json:"target"`
	Unpaid float64 `json:"unpaid"`
}

// One thing expected to come in this month: a salary, an invoice, a fee.
type BudgetIncome struct {
	ID      int64   `json:"id"`
	OnMonth string  `json:"on_month"`
	Name    string  `json:"name"`
	Amount  float64 `json:"amount"`
	// What the source pays in, which is not always what the month is budgeted
	// in. Converted is the same money in the month's currency, and is what the
	// totals and every percentage are built from.
	Currency    string  `json:"currency"`
	Converted   float64 `json:"converted"`
	AccountID   *int64  `json:"account_id"`
	AccountName string  `json:"account_name"`
	Received    bool    `json:"received"`
	// The day it is expected, as YYYY-MM-DD, or empty when no day was given.
	DueOn     string    `json:"due_on"`
	Position  int       `json:"position"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type BudgetIncomeInput struct {
	Name      string  `json:"name"`
	Amount    float64 `json:"amount"`
	Currency  string  `json:"currency"`
	AccountID *int64  `json:"account_id"`
	DueOn     string  `json:"due_on"`
	Notes     string  `json:"notes"`
}

/*
convertMoney moves an amount between currencies using the stored rates, the
same arithmetic the money pages do in the browser: every rate is against one
common base, so going from one to another is a multiply and a divide.

An unknown currency comes back untouched with ok false, so the caller can say
the total is short rather than quietly pretending it is not.
*/
func convertMoney(amount float64, from, to string, rates []FxRate) (float64, bool) {
	if from == to || amount == 0 {
		return amount, true
	}
	var fromRate, toRate float64
	for _, rate := range rates {
		if rate.Currency == from {
			fromRate = rate.Rate
		}
		if rate.Currency == to {
			toRate = rate.Rate
		}
	}
	if fromRate == 0 || toRate == 0 {
		return amount, false
	}
	return amount * fromRate / toRate, true
}

type BudgetMonth struct {
	OnMonth string `json:"on_month"`
	/*
		Everything expected in, added up from the sources below. Budgeting
		happens before the money lands, so this is what the shares are worked
		out against; Received is what has actually turned up.
	*/
	Income   float64        `json:"income"`
	Received float64        `json:"received"`
	Incomes  []BudgetIncome `json:"incomes"`
	// A source is in a currency with no stored rate, so the total is short by
	// at least that much. Better said out loud than silently rounded away.
	Missing  bool         `json:"missing"`
	Currency string       `json:"currency"`
	Notes    string       `json:"notes"`
	Lines    []BudgetLine `json:"lines"`
	Buckets  []BucketRoll `json:"buckets"`
	// Everything the lines add up to, what that leaves of the income, and what
	// is still owed. Negative left-over is the number worth seeing, so it is
	// not clamped.
	Allocated float64 `json:"allocated"`
	Left      float64 `json:"left"`
	Unpaid    float64 `json:"unpaid"`
}

const monthLayout = "2006-01-02"

// firstOf drops the day, so any date inside a month names that month.
func firstOf(t time.Time) time.Time {
	y, m, _ := t.Date()
	return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
}

func (s *Store) MoneyAccounts(ctx context.Context) ([]MoneyAccount, error) {
	rows, err := s.pool.Query(ctx, `
		select id, name, balance, currency, position, notes,
		       created_by, updated_by, created_at, updated_at
		  from money_accounts where deleted_at is null
		 order by position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []MoneyAccount{}
	for rows.Next() {
		var a MoneyAccount
		if err := rows.Scan(&a.ID, &a.Name, &a.Balance, &a.Currency, &a.Position, &a.Notes,
			&a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) CreateMoneyAccount(ctx context.Context, in MoneyAccountInput, actor string) (MoneyAccount, error) {
	var a MoneyAccount
	err := s.pool.QueryRow(ctx, `
		insert into money_accounts (name, balance, currency, notes, position, created_by, updated_by)
		values ($1, $2, $3, $4,
		        coalesce((select max(position) + 1 from money_accounts where deleted_at is null), 0),
		        $5, $5)
		returning id, name, balance, currency, position, notes,
		          created_by, updated_by, created_at, updated_at`,
		in.Name, in.Balance, in.Currency, in.Notes, actor).
		Scan(&a.ID, &a.Name, &a.Balance, &a.Currency, &a.Position, &a.Notes,
			&a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt)
	return a, norm(err)
}

func (s *Store) UpdateMoneyAccount(ctx context.Context, id int64, in MoneyAccountInput, actor string) (MoneyAccount, error) {
	var a MoneyAccount
	err := s.pool.QueryRow(ctx, `
		update money_accounts
		   set name = $1, balance = $2, currency = $3, notes = $4,
		       updated_by = $5, updated_at = now()
		 where id = $6 and deleted_at is null
		returning id, name, balance, currency, position, notes,
		          created_by, updated_by, created_at, updated_at`,
		in.Name, in.Balance, in.Currency, in.Notes, actor, id).
		Scan(&a.ID, &a.Name, &a.Balance, &a.Currency, &a.Position, &a.Notes,
			&a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt)
	return a, norm(err)
}

func (s *Store) DeleteMoneyAccount(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "money_accounts", id, actor)
}

func (s *Store) RestoreMoneyAccount(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "money_accounts", id, actor)
}

func (s *Store) BudgetTargets(ctx context.Context) (map[string]float64, error) {
	rows, err := s.pool.Query(ctx, `select bucket, percent from budget_targets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]float64{}
	for rows.Next() {
		var bucket string
		var percent float64
		if err := rows.Scan(&bucket, &percent); err != nil {
			return nil, err
		}
		out[bucket] = percent
	}
	return out, rows.Err()
}

func (s *Store) SetBudgetTarget(ctx context.Context, bucket string, percent float64) error {
	_, err := s.pool.Exec(ctx, `
		insert into budget_targets (bucket, percent) values ($1, $2)
		on conflict (bucket) do update set percent = excluded.percent`, bucket, percent)
	return err
}

/*
Budget reads one month whole: its income, its lines, and what they come to per
bucket. A month that has never been opened is created here rather than 404ing,
because "this month" is a thing that always exists — see seed for what it
arrives holding.
*/
func (s *Store) Budget(ctx context.Context, month time.Time, actor string) (BudgetMonth, error) {
	on := firstOf(month)
	var out BudgetMonth

	var unused float64
	err := s.pool.QueryRow(ctx, `
		insert into budget_months (on_month, created_by, updated_by) values ($1, $2, $2)
		on conflict (on_month) do update set on_month = excluded.on_month
		returning to_char(on_month, 'YYYY-MM-DD'), income, currency, notes`, on, actor).
		Scan(&out.OnMonth, &unused, &out.Currency, &out.Notes)
	if err != nil {
		return out, norm(err)
	}

	// Income is added up from its sources rather than read off the month. The
	// column is left where it is, holding whatever the single-figure version
	// last wrote, because dropping a column is not worth the trouble it can
	// cause and nothing reads it.
	if out.Incomes, err = s.budgetIncomes(ctx, on); err != nil {
		return out, err
	}
	rates, err := s.Rates(ctx)
	if err != nil {
		return out, err
	}
	for at := range out.Incomes {
		income := &out.Incomes[at]
		converted, ok := convertMoney(income.Amount, income.Currency, out.Currency, rates)
		if !ok {
			out.Missing = true
		}
		income.Converted = converted
		out.Income += converted
		if income.Received {
			out.Received += converted
		}
	}

	if out.Lines, err = s.budgetLines(ctx, on, out.Income); err != nil {
		return out, err
	}

	targets, err := s.BudgetTargets(ctx)
	if err != nil {
		return out, err
	}

	byBucket := map[string]*BucketRoll{}
	for _, bucket := range BudgetBuckets {
		byBucket[bucket] = &BucketRoll{Bucket: bucket, Target: targets[bucket]}
	}
	for _, line := range out.Lines {
		roll, ok := byBucket[line.Bucket]
		if !ok {
			// A bucket that is no longer one of the four still has to add up
			// somewhere, or the totals stop matching the rows on screen.
			roll = &BucketRoll{Bucket: line.Bucket}
			byBucket[line.Bucket] = roll
		}
		roll.Amount += line.Amount
		if !line.Paid {
			roll.Unpaid += line.Amount
			out.Unpaid += line.Amount
		}
		out.Allocated += line.Amount
	}

	out.Buckets = []BucketRoll{}
	for _, bucket := range BudgetBuckets {
		roll := byBucket[bucket]
		if out.Income > 0 {
			roll.Percent = roll.Amount / out.Income * 100
		}
		out.Buckets = append(out.Buckets, *roll)
	}
	// Negative on purpose when more has been promised than came in. That is
	// the number the whole page exists to show.
	out.Left = out.Income - out.Allocated
	return out, nil
}

// Ordered by the day it falls on, because a budget is read forwards: what is
// due next is what you are about to do something about. Rows with no day sit
// at the end rather than at the top, keeping the order they were typed in —
// they are the ones with nothing pressing about them.
func (s *Store) budgetLines(ctx context.Context, on time.Time, income float64) ([]BudgetLine, error) {
	rows, err := s.pool.Query(ctx, `
		select l.id, to_char(l.on_month, 'YYYY-MM-DD'), l.name, l.account_id,
		       coalesce(a.name, ''), l.bucket, l.amount, l.percent, l.paid,
		       coalesce(to_char(l.due_on, 'YYYY-MM-DD'), ''),
		       l.expense_id, l.position, l.notes,
		       l.created_by, l.updated_by, l.created_at, l.updated_at
		  from budget_lines l
		  left join money_accounts a on a.id = l.account_id
		 where l.on_month = $1 and l.deleted_at is null
		 order by l.due_on nulls last, l.position, l.id`, on)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []BudgetLine{}
	for rows.Next() {
		var l BudgetLine
		if err := rows.Scan(&l.ID, &l.OnMonth, &l.Name, &l.AccountID, &l.AccountName,
			&l.Bucket, &l.Amount, &l.Percent, &l.Paid, &l.DueOn, &l.ExpenseID, &l.Position,
			&l.Notes,
			&l.CreatedBy, &l.UpdatedBy, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		// A share is worked out now rather than stored, so it follows income.
		if l.Percent != nil {
			l.Amount = income * *l.Percent / 100
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// Same order as the lines, and for the same reason: the 25th comes before the
// invoice with no date on it.
func (s *Store) budgetIncomes(ctx context.Context, on time.Time) ([]BudgetIncome, error) {
	rows, err := s.pool.Query(ctx, `
		select i.id, to_char(i.on_month, 'YYYY-MM-DD'), i.name, i.amount, i.currency,
		       i.account_id, coalesce(a.name, ''), i.received,
		       coalesce(to_char(i.due_on, 'YYYY-MM-DD'), ''), i.position, i.notes,
		       i.created_by, i.updated_by, i.created_at, i.updated_at
		  from budget_incomes i
		  left join money_accounts a on a.id = i.account_id
		 where i.on_month = $1 and i.deleted_at is null
		 order by i.due_on nulls last, i.position, i.id`, on)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []BudgetIncome{}
	for rows.Next() {
		var i BudgetIncome
		if err := rows.Scan(&i.ID, &i.OnMonth, &i.Name, &i.Amount, &i.Currency,
			&i.AccountID, &i.AccountName, &i.Received, &i.DueOn, &i.Position, &i.Notes,
			&i.CreatedBy, &i.UpdatedBy, &i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (s *Store) CreateBudgetIncome(ctx context.Context, month time.Time, in BudgetIncomeInput, actor string) (BudgetIncome, error) {
	on := firstOf(month)
	if _, err := s.pool.Exec(ctx, `
		insert into budget_months (on_month, created_by, updated_by) values ($1, $2, $2)
		on conflict (on_month) do nothing`, on, actor); err != nil {
		return BudgetIncome{}, err
	}

	var id int64
	err := s.pool.QueryRow(ctx, `
		insert into budget_incomes (on_month, name, amount, currency, account_id, due_on,
		                            notes, position, created_by, updated_by)
		values ($1, $2, $3, $4, $5, nullif($6, '')::date, $7,
		        coalesce((select max(position) + 1 from budget_incomes
		                   where on_month = $1 and deleted_at is null), 0),
		        $8, $8)
		returning id`, on, in.Name, in.Amount, in.Currency, in.AccountID, in.DueOn,
		in.Notes, actor).Scan(&id)
	if err != nil {
		return BudgetIncome{}, norm(err)
	}
	return s.budgetIncome(ctx, id)
}

func (s *Store) UpdateBudgetIncome(ctx context.Context, id int64, in BudgetIncomeInput, actor string) (BudgetIncome, error) {
	tag, err := s.pool.Exec(ctx, `
		update budget_incomes
		   set name = $1, amount = $2, currency = $3, account_id = $4,
		       due_on = nullif($5, '')::date, notes = $6,
		       updated_by = $7, updated_at = now()
		 where id = $8 and deleted_at is null`,
		in.Name, in.Amount, in.Currency, in.AccountID, in.DueOn, in.Notes, actor, id)
	if err != nil {
		return BudgetIncome{}, norm(err)
	}
	if tag.RowsAffected() == 0 {
		return BudgetIncome{}, ErrNotFound
	}
	return s.budgetIncome(ctx, id)
}

// SetBudgetIncomeReceived is the tick that says the money turned up.
func (s *Store) SetBudgetIncomeReceived(ctx context.Context, id int64, received bool, actor string) error {
	tag, err := s.pool.Exec(ctx, `
		update budget_incomes set received = $1, updated_by = $2, updated_at = now()
		 where id = $3 and deleted_at is null`, received, actor, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteBudgetIncome(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "budget_incomes", id, actor)
}

func (s *Store) RestoreBudgetIncome(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "budget_incomes", id, actor)
}

func (s *Store) budgetIncome(ctx context.Context, id int64) (BudgetIncome, error) {
	var i BudgetIncome
	err := s.pool.QueryRow(ctx, `
		select i.id, to_char(i.on_month, 'YYYY-MM-DD'), i.name, i.amount, i.currency,
		       i.account_id, coalesce(a.name, ''), i.received,
		       coalesce(to_char(i.due_on, 'YYYY-MM-DD'), ''), i.position, i.notes,
		       i.created_by, i.updated_by, i.created_at, i.updated_at
		  from budget_incomes i
		  left join money_accounts a on a.id = i.account_id
		 where i.id = $1 and i.deleted_at is null`, id).
		Scan(&i.ID, &i.OnMonth, &i.Name, &i.Amount, &i.Currency,
			&i.AccountID, &i.AccountName, &i.Received, &i.DueOn, &i.Position, &i.Notes,
			&i.CreatedBy, &i.UpdatedBy, &i.CreatedAt, &i.UpdatedAt)
	return i, norm(err)
}

/*
SeedBudget fills an empty month from what is already known.

Two sources, and both are things that would otherwise be retyped every month:
the recurring expenses HQ already tracks, and whatever was in last month that
did not come from one. Nothing is copied as paid — a month starts owing
everything.

It refuses to run on a month that already has lines, so pressing the button
twice cannot double the budget.
*/
func (s *Store) SeedBudget(ctx context.Context, month time.Time, actor string) (int, error) {
	on := firstOf(month)
	// Both sides count as "already started". Guarding on the allocations alone
	// would let a second press duplicate the income sources of a month that
	// had only those typed in so far.
	var count int
	if err := s.pool.QueryRow(ctx, `
		select (select count(*) from budget_lines
		         where on_month = $1 and deleted_at is null)
		     + (select count(*) from budget_incomes
		         where on_month = $1 and deleted_at is null)`, on).Scan(&count); err != nil {
		return 0, err
	}
	if count > 0 {
		return 0, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// Both tables below point at the month, so it has to exist first. Opening
	// the page creates it, but seeding is reachable without ever having done
	// that — from the API, or from a page that has just been navigated to.
	if _, err := tx.Exec(ctx, `
		insert into budget_months (on_month, created_by, updated_by) values ($1, $2, $2)
		on conflict (on_month) do nothing`, on, actor); err != nil {
		return 0, err
	}

	/*
		The recurring side: everything monthly, plus anything on a longer cycle
		that happens to fall due inside this month. A yearly renewal is not a
		line in every month, but it is very much a line in the one it lands in,
		and that is exactly the bill a budget forgets about.

		The amount is converted on the way in, because a stream can be billed
		in dollars while the month is budgeted in rupiah. Missing rates fall
		back to 1, which leaves the figure alone rather than zeroing it.
	*/
	tag, err := tx.Exec(ctx, `
		insert into budget_lines (on_month, name, bucket, amount, expense_id, due_on,
		                          position, created_by, updated_by)
		select $1, e.name, 'needs',
		       e.amount * coalesce(fr.rate, 1) / coalesce(mr.rate, 1), e.id,
		       case when e.next_due_on >= $1
		             and e.next_due_on < ($1::date + interval '1 month')
		            then e.next_due_on end,
		       row_number() over (order by e.name),
		       $2, $2
		  from expense_streams e
		  left join fx_rates fr on fr.currency = e.currency
		  left join fx_rates mr
		         on mr.currency = (select currency from budget_months where on_month = $1)
		 where e.deleted_at is null and e.status = 'active'
		   and (e.cycle = 'monthly'
		        or (e.next_due_on >= $1
		            and e.next_due_on < ($1::date + interval '1 month')))`,
		on, actor)
	if err != nil {
		return 0, err
	}
	made := int(tag.RowsAffected())

	// Last month's own lines, the ones somebody typed rather than generated.
	tag, err = tx.Exec(ctx, `
		insert into budget_lines (on_month, name, account_id, bucket, amount, percent,
		                          due_on, position, notes, created_by, updated_by)
		select $1, l.name, l.account_id, l.bucket, l.amount, l.percent,
		       (l.due_on + interval '1 month')::date,
		       $3 + row_number() over (order by l.position, l.id), l.notes, $2, $2
		  from budget_lines l
		 where l.on_month = ($1::date - interval '1 month')
		   and l.deleted_at is null and l.expense_id is null`,
		on, actor, made)
	if err != nil {
		return 0, err
	}
	made += int(tag.RowsAffected())

	// The income side too. A salary and a retainer come round every month, and
	// nothing arrives already received.
	tag, err = tx.Exec(ctx, `
		insert into budget_incomes (on_month, name, amount, currency, account_id, due_on,
		                            position, notes, created_by, updated_by)
		select $1, i.name, i.amount, i.currency, i.account_id,
		       (i.due_on + interval '1 month')::date,
		       row_number() over (order by i.position, i.id), i.notes, $2, $2
		  from budget_incomes i
		 where i.on_month = ($1::date - interval '1 month') and i.deleted_at is null`,
		on, actor)
	if err != nil {
		return 0, err
	}
	made += int(tag.RowsAffected())

	return made, tx.Commit(ctx)
}

func (s *Store) CreateBudgetLine(ctx context.Context, month time.Time, in BudgetLineInput, actor string) (BudgetLine, error) {
	on := firstOf(month)
	// The month has to exist before a line can point at it.
	if _, err := s.pool.Exec(ctx, `
		insert into budget_months (on_month, created_by, updated_by) values ($1, $2, $2)
		on conflict (on_month) do nothing`, on, actor); err != nil {
		return BudgetLine{}, err
	}

	var id int64
	err := s.pool.QueryRow(ctx, `
		insert into budget_lines (on_month, name, account_id, bucket, amount, percent,
		                          due_on, notes, position, created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, nullif($7, '')::date, $8,
		        coalesce((select max(position) + 1 from budget_lines
		                   where on_month = $1 and deleted_at is null), 0),
		        $9, $9)
		returning id`,
		on, in.Name, in.AccountID, in.Bucket, in.Amount, in.Percent, in.DueOn,
		in.Notes, actor).Scan(&id)
	if err != nil {
		return BudgetLine{}, norm(err)
	}
	return s.budgetLine(ctx, id)
}

func (s *Store) UpdateBudgetLine(ctx context.Context, id int64, in BudgetLineInput, actor string) (BudgetLine, error) {
	tag, err := s.pool.Exec(ctx, `
		update budget_lines
		   set name = $1, account_id = $2, bucket = $3, amount = $4, percent = $5,
		       due_on = nullif($6, '')::date, notes = $7,
		       updated_by = $8, updated_at = now()
		 where id = $9 and deleted_at is null`,
		in.Name, in.AccountID, in.Bucket, in.Amount, in.Percent, in.DueOn,
		in.Notes, actor, id)
	if err != nil {
		return BudgetLine{}, norm(err)
	}
	if tag.RowsAffected() == 0 {
		return BudgetLine{}, ErrNotFound
	}
	return s.budgetLine(ctx, id)
}

// SetBudgetLinePaid is the tick. Separate from the edit because it is the one
// thing that happens to a line after the month has started.
func (s *Store) SetBudgetLinePaid(ctx context.Context, id int64, paid bool, actor string) error {
	tag, err := s.pool.Exec(ctx, `
		update budget_lines set paid = $1, updated_by = $2, updated_at = now()
		 where id = $3 and deleted_at is null`, paid, actor, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteBudgetLine(ctx context.Context, id int64, actor string) error {
	return s.softDeleteByID(ctx, "budget_lines", id, actor)
}

func (s *Store) RestoreBudgetLine(ctx context.Context, id int64, actor string) error {
	return s.restore(ctx, "budget_lines", id, actor)
}

/*
monthIncome adds a month's sources up in that month's own currency.

It exists because a line given as a share has to be worked out against
something, and after income became a list there is no single figure sitting on
the month to read. Budget does the same sum inline while it is walking the
sources anyway; this is for the callers that have one row and need the total.
*/
func (s *Store) monthIncome(ctx context.Context, on time.Time) (float64, error) {
	var currency string
	err := s.pool.QueryRow(ctx,
		`select currency from budget_months where on_month = $1`, on).Scan(&currency)
	if err != nil {
		return 0, norm(err)
	}
	rates, err := s.Rates(ctx)
	if err != nil {
		return 0, err
	}

	rows, err := s.pool.Query(ctx, `
		select amount, currency from budget_incomes
		 where on_month = $1 and deleted_at is null`, on)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var total float64
	for rows.Next() {
		var amount float64
		var from string
		if err := rows.Scan(&amount, &from); err != nil {
			return 0, err
		}
		converted, _ := convertMoney(amount, from, currency, rates)
		total += converted
	}
	return total, rows.Err()
}

func (s *Store) budgetLine(ctx context.Context, id int64) (BudgetLine, error) {
	var l BudgetLine
	err := s.pool.QueryRow(ctx, `
		select l.id, to_char(l.on_month, 'YYYY-MM-DD'), l.name, l.account_id,
		       coalesce(a.name, ''), l.bucket, l.amount, l.percent, l.paid,
		       coalesce(to_char(l.due_on, 'YYYY-MM-DD'), ''),
		       l.expense_id, l.position, l.notes,
		       l.created_by, l.updated_by, l.created_at, l.updated_at
		  from budget_lines l
		  left join money_accounts a on a.id = l.account_id
		 where l.id = $1 and l.deleted_at is null`, id).
		Scan(&l.ID, &l.OnMonth, &l.Name, &l.AccountID, &l.AccountName,
			&l.Bucket, &l.Amount, &l.Percent, &l.Paid, &l.DueOn, &l.ExpenseID, &l.Position,
			&l.Notes,
			&l.CreatedBy, &l.UpdatedBy, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		return l, norm(err)
	}
	// A share is worked out against the month's sources added up, which is a
	// second query and only worth making for the lines that are one.
	if l.Percent != nil {
		on, err := time.Parse(monthLayout, l.OnMonth)
		if err != nil {
			return l, err
		}
		income, err := s.monthIncome(ctx, on)
		if err != nil {
			return l, err
		}
		l.Amount = income * *l.Percent / 100
	}
	return l, nil
}
