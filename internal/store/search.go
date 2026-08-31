package store

import (
	"context"
	"strings"
)

// Hit is one thing found anywhere in the app. Title is what you searched for,
// subtitle is the context that tells two similarly-named things apart, and URL
// is where clicking it lands.
type Hit struct {
	Entity   string `json:"entity"`
	ID       int64  `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Detail   string `json:"detail"`
	URL      string `json:"url"`
}

// Every branch of the union hands back the same six columns plus a haystack to
// match against and a rank. Encrypted columns are deliberately absent: they are
// ciphertext, so matching them would find nothing and leak the attempt into a
// query plan for no reason.
//
// $1 is the whole phrase, used only for ranking. $2 is the list of words, each
// of which has to appear somewhere in the row.
const searchSQL = `
with hits as (

  select 'project' as entity, p.id, p.name as title,
         coalesce(c.name, '') as subtitle,
         coalesce(nullif(p.summary, ''), p.notes) as detail,
         '/projects/' || p.slug as url,
         concat_ws(' ', p.name, p.slug, p.kind, p.status, p.summary, p.notes,
                        p.local_path, p.deploy_target, c.name) as hay
    from projects p
    left join clients c on c.id = p.client_id and c.deleted_at is null
   where p.deleted_at is null

  union all
  select 'link', l.id, l.label, p.name, l.url,
         '/projects/' || p.slug,
         concat_ws(' ', l.label, l.url, l.category, l.notes, p.name)
    from project_links l
    join projects p on p.id = l.project_id and p.deleted_at is null

  union all
  select 'credential', cr.id, cr.label, coalesce(p.name, ''),
         concat_ws(' · ', nullif(cr.username, ''), nullif(cr.host, '')),
         '/credentials/' || cr.id,
         concat_ws(' ', cr.label, cr.kind, cr.username, cr.host, cr.url, cr.notes, p.name)
    from credentials cr
    left join projects p on p.id = cr.project_id and p.deleted_at is null
   where cr.deleted_at is null

  union all
  select 'client', c.id, c.name, c.kind, c.notes, '/clients/' || c.slug,
         concat_ws(' ', c.name, c.slug, c.company, c.kind, c.status, c.notes)
    from clients c
   where c.deleted_at is null

  union all
  select 'contact', ct.id, coalesce(nullif(ct.nickname, ''), ct.name), c.name,
         concat_ws(' · ', nullif(ct.role, ''), nullif(ct.email, ''), nullif(ct.phone, '')),
         '/clients/' || c.slug,
         concat_ws(' ', ct.name, ct.nickname, ct.role, ct.email, ct.phone, ct.notes, c.name)
    from contacts ct
    join clients c on c.id = ct.client_id and c.deleted_at is null
   where ct.deleted_at is null

  union all
  select 'asset', a.id, a.name, a.provider,
         concat_ws(' · ', nullif(a.identifier, ''), nullif(cr.label, '')),
         '/assets/' || a.id,
         concat_ws(' ', a.name, a.kind, a.provider, a.identifier, a.status, a.notes,
                        cr.label, cr.username)
    from assets a
    left join credentials cr on cr.id = a.credential_id and cr.deleted_at is null
   where a.deleted_at is null

  union all
  select 'document', d.id, d.name, d.holder, d.issuer, '/documents/' || d.id,
         concat_ws(' ', d.name, d.kind, d.holder, d.issuer, d.location, d.notes)
    from documents d
   where d.deleted_at is null

  union all
  select 'belonging', b.id, b.name, concat_ws(' ', b.brand, b.model),
         b.identifier, '/belongings/' || b.id,
         concat_ws(' ', b.name, b.kind, b.brand, b.model, b.identifier,
                        b.location, b.status, b.notes)
    from belongings b
   where b.deleted_at is null

  union all
  select 'maintenance', m.id, coalesce(nullif(m.description, ''), m.kind), b.name,
         m.vendor, '/belongings/' || b.id,
         concat_ws(' ', m.description, m.kind, m.vendor, b.name)
    from maintenance_logs m
    join belongings b on b.id = m.belonging_id and b.deleted_at is null

  union all
  select 'person', ct.id, coalesce(nullif(ct.nickname, ''), ct.name), ct.role,
         concat_ws(' · ', nullif(ct.email, ''), nullif(ct.phone, '')),
         '/people/' || ct.id,
         concat_ws(' ', ct.name, ct.nickname, ct.role, ct.email, ct.phone, ct.notes)
    from contacts ct
   where ct.deleted_at is null and ct.client_id is null

  union all
  select 'income', i.id, i.name, coalesce(p.name, c.name, ''), i.notes,
         '/income/' || i.id,
         concat_ws(' ', i.name, i.status, i.notes, p.name, c.name)
    from income_streams i
    left join projects p on p.id = i.project_id and p.deleted_at is null
    left join clients c on c.id = i.client_id and c.deleted_at is null
   where i.deleted_at is null

  union all
  select 'expense', e.id, e.name, coalesce(p.name, a.name, ''), e.notes,
         '/expenses/' || e.id,
         concat_ws(' ', e.name, e.category, e.notes, p.name, a.name)
    from expense_streams e
    left join projects p on p.id = e.project_id and p.deleted_at is null
    left join assets a on a.id = e.asset_id and a.deleted_at is null
   where e.deleted_at is null

  union all
  select 'supply', s.id, s.name, s.location,
         concat_ws(' ', 'sisa', trim_scale(s.quantity)::text, s.unit),
         '/supplies/' || s.id,
         concat_ws(' ', s.name, s.category, s.location, s.unit, s.notes)
    from supplies s
   where s.deleted_at is null

  union all
  select 'tag', t.id, t.name, '', '', '/projects?tag=' || t.slug,
         concat_ws(' ', t.name, t.slug)
    from tags t
)
select entity, id, title, subtitle, detail, url
  from hits
 where hay ilike all ($2::text[])
 order by
   case
     when lower(title) = lower($1)          then 0
     when title ilike $1 || '%'             then 1
     when title ilike '%' || $1 || '%'      then 2
     when subtitle ilike '%' || $1 || '%'   then 3
     else 4
   end,
   length(title),
   lower(title)
 limit $3`

// Search looks through everything at once. Every word has to appear somewhere
// in a row for it to count, so more words narrow rather than widen — which is
// what people expect and almost never what a naive OR search does.
func (s *Store) Search(ctx context.Context, query string, limit int) ([]Hit, error) {
	phrase := strings.TrimSpace(query)
	if phrase == "" {
		return []Hit{}, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 40
	}

	words := strings.Fields(phrase)
	patterns := make([]string, 0, len(words))
	for _, word := range words {
		patterns = append(patterns, "%"+escapeLike(word)+"%")
	}

	rows, err := s.pool.Query(ctx, searchSQL, phrase, patterns, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Hit{}
	for rows.Next() {
		var h Hit
		if err := rows.Scan(&h.Entity, &h.ID, &h.Title, &h.Subtitle, &h.Detail, &h.URL); err != nil {
			return nil, err
		}
		h.Title = strings.TrimSpace(h.Title)
		h.Subtitle = strings.TrimSpace(h.Subtitle)
		h.Detail = strings.TrimSpace(h.Detail)
		out = append(out, h)
	}
	return out, rows.Err()
}

// A literal % or _ typed into the box should match itself, not act as a
// wildcard that quietly returns everything.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}
