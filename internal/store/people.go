package store

import (
	"context"
	"strings"
)

// Person is the address-book view of a contact. A contact with no client is
// someone you know; one with a client is that client's PIC. Same table, so a
// number typed once is findable from both places.
type Person struct {
	Contact
	ClientName string `json:"client_name"`
	ClientSlug string `json:"client_slug"`
	// DueToReach is true once reach_every_days has elapsed since the last
	// contact, which is what the "waktunya nyapa" list is built from.
	DueToReach bool `json:"due_to_reach"`
}

type PersonFilter struct {
	Query string
	// Scope is "" for everyone, "personal" for contacts with no client,
	// "client" for the ones attached to a client.
	Scope string
}

const personCols = `c.id, c.client_id, c.name, c.nickname, c.role, c.email, c.phone, c.is_primary,
	c.notes, c.created_by, c.updated_by, c.created_at, c.updated_at,
	c.birthday, c.last_contacted_on, c.reach_every_days,
	coalesce(cl.name, ''), coalesce(cl.slug, ''),
	(c.reach_every_days > 0
	 and (c.last_contacted_on is null
	      or c.last_contacted_on + c.reach_every_days <= current_date))`

func scanPerson(row interface{ Scan(...any) error }) (Person, error) {
	var p Person
	err := row.Scan(&p.ID, &p.ClientID, &p.Name, &p.Nickname, &p.Role, &p.Email, &p.Phone,
		&p.IsPrimary, &p.Notes, &p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt,
		&p.Birthday, &p.LastContactedOn, &p.ReachEveryDays,
		&p.ClientName, &p.ClientSlug, &p.DueToReach)
	return p, err
}

func (s *Store) ListPeople(ctx context.Context, f PersonFilter) ([]Person, error) {
	rows, err := s.pool.Query(ctx, `select `+personCols+`
		from contacts c
		left join clients cl on cl.id = c.client_id and cl.deleted_at is null
		where c.deleted_at is null
		  and ($1 = '' or c.name ilike '%' || $1 || '%'
		                or c.nickname ilike '%' || $1 || '%'
		                or c.role ilike '%' || $1 || '%'
		                or c.email ilike '%' || $1 || '%'
		                or c.phone ilike '%' || $1 || '%')
		  and ($2 = ''
		       or ($2 = 'personal' and c.client_id is null)
		       or ($2 = 'client' and c.client_id is not null))
		order by lower(c.name)`, strings.TrimSpace(f.Query), f.Scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Person{}
	for rows.Next() {
		p, err := scanPerson(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) PersonByID(ctx context.Context, id int64) (Person, error) {
	p, err := scanPerson(s.pool.QueryRow(ctx, `select `+personCols+`
		from contacts c
		left join clients cl on cl.id = c.client_id and cl.deleted_at is null
		where c.id = $1 and c.deleted_at is null`, id))
	return p, norm(err)
}

type PersonInput struct {
	ClientID        *int64 `json:"client_id"`
	Name            string `json:"name"`
	Nickname        string `json:"nickname"`
	Role            string `json:"role"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	Notes           string `json:"notes"`
	Birthday        string `json:"birthday"`
	LastContactedOn string `json:"last_contacted_on"`
	ReachEveryDays  int    `json:"reach_every_days"`
}

func (s *Store) CreatePerson(ctx context.Context, in PersonInput, actor string) (Person, error) {
	birthday, err := parseDate(in.Birthday)
	if err != nil {
		return Person{}, err
	}
	last, err := parseDate(in.LastContactedOn)
	if err != nil {
		return Person{}, err
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		insert into contacts (client_id, name, nickname, role, email, phone, notes,
		                      birthday, last_contacted_on, reach_every_days,
		                      created_by, updated_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
		returning id`,
		in.ClientID, in.Name, in.Nickname, in.Role, in.Email, in.Phone, in.Notes,
		birthday, last, in.ReachEveryDays, actor).Scan(&id)
	if err != nil {
		return Person{}, norm(err)
	}
	return s.PersonByID(ctx, id)
}

func (s *Store) UpdatePerson(ctx context.Context, id int64, in PersonInput, actor string) (Person, error) {
	birthday, err := parseDate(in.Birthday)
	if err != nil {
		return Person{}, err
	}
	last, err := parseDate(in.LastContactedOn)
	if err != nil {
		return Person{}, err
	}
	tag, err := s.pool.Exec(ctx, `
		update contacts set client_id = $1, name = $2, nickname = $3, role = $4, email = $5,
		       phone = $6, notes = $7, birthday = $8, last_contacted_on = $9,
		       reach_every_days = $10, updated_by = $11, updated_at = now()
		 where id = $12 and deleted_at is null`,
		in.ClientID, in.Name, in.Nickname, in.Role, in.Email, in.Phone, in.Notes,
		birthday, last, in.ReachEveryDays, actor, id)
	if err != nil {
		return Person{}, err
	}
	if tag.RowsAffected() == 0 {
		return Person{}, ErrNotFound
	}
	return s.PersonByID(ctx, id)
}

// TouchPerson stamps today as the last contact. One button, because the whole
// point is that logging it must be cheaper than not logging it.
func (s *Store) TouchPerson(ctx context.Context, id int64, actor string) error {
	tag, err := s.pool.Exec(ctx, `
		update contacts set last_contacted_on = current_date, updated_by = $2,
		       updated_at = now()
		 where id = $1 and deleted_at is null`, id, actor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
