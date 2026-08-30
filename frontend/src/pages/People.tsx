import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Mail, Phone, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Person } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorNote, formatDate, PageHeader } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

const ALL = '__all__'

export default function People() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [people, setPeople] = useState<Person[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const query = { q: params.get('q') ?? '', scope: params.get('scope') ?? '' }
  const filtered = Boolean(query.q || query.scope)

  const load = useCallback(() => {
    setLoading(true)
    api
      .people(query)
      .then((data) => {
        setPeople(data.people)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // params is the source of truth for the filters.
  }, [params])

  useEffect(load, [load])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  async function touch(person: Person) {
    await api.touchPerson(person.id).catch(() => undefined)
    toast.success(t('people.touched', { name: person.nickname || person.name }))
    load()
  }

  const due = people.filter((p) => p.due_to_reach).length

  return (
    <>
      <PageHeader
        title={t('people.title')}
        description={
          loading ? t('common.loading') : t('people.count', { n: people.length, due })
        }
        action={
          <Button asChild>
            <Link to="/people/new">
              <Plus className="size-4" />
              {t('people.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('people.searchPlaceholder')}
            value={query.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <Select value={query.scope || ALL} onValueChange={(v) => update('scope', v)}>
          <SelectTrigger className="w-[12rem]">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('people.scopeAll')}</SelectItem>
            <SelectItem value="personal">{t('people.scopePersonal')}</SelectItem>
            <SelectItem value="client">{t('people.scopeClient')}</SelectItem>
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
            <X className="size-4" />
            {t('common.reset')}
          </Button>
        )}
      </div>

      <Responsive
        table={
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('project.client')}</TableHead>
                  <TableHead>{t('people.contact')}</TableHead>
                  <TableHead>{t('people.lastTalked')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow
                    key={person.id}
                    onClick={() => navigate(`/people/${person.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {person.nickname || person.name}
                        {person.due_to_reach && (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-warning/15 text-[11px] text-warning"
                          >
                            {t('people.due')}
                          </Badge>
                        )}
                      </div>
                      {(person.nickname || person.role) && (
                        <div className="text-xs text-muted-foreground">
                          {[person.nickname ? person.name : '', person.role]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.client_slug ? (
                        <Link
                          to={`/clients/${person.client_slug}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {person.client_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-0.5 text-xs">
                        {person.email && (
                          <a
                            href={`mailto:${person.email}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Mail className="size-3" />
                            {person.email}
                          </a>
                        )}
                        {person.phone && (
                          <a
                            href={`tel:${person.phone.replace(/\s/g, '')}`}
                            className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                          >
                            <Phone className="size-3" />
                            {person.phone}
                          </a>
                        )}
                        {!person.email && !person.phone && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {person.last_contacted_on
                        ? formatDate(person.last_contacted_on)
                        : t('people.never')}
                      {person.reach_every_days > 0 && (
                        <div>{t('people.everyDays', { n: person.reach_every_days })}</div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => touch(person)}
                        aria-label={t('people.touch')}
                        title={t('people.touch')}
                      >
                        <Check className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && people.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t('people.none')}{' '}
                      <Link to="/people/new" className="text-primary hover:underline">
                        {t('home.addOne')}
                      </Link>
                      .
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        }
        cards={
          <CardList
            items={people}
            keyOf={(p) => p.id}
            onPick={(p) => navigate(`/people/${p.id}`)}
            empty={loading ? null : t('people.none')}
            render={(p) => ({
              title: (
                <span className="flex items-center gap-2">
                  {p.nickname || p.name}
                  {p.due_to_reach && (
                    <Badge
                      variant="outline"
                      className="border-transparent bg-warning/15 text-[11px] text-warning"
                    >
                      {t('people.due')}
                    </Badge>
                  )}
                </span>
              ),
              subtitle:
                [p.nickname ? p.name : '', p.role].filter(Boolean).join(' · ') || undefined,
              trailing: (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    void touch(p)
                  }}
                  aria-label={t('people.touch')}
                >
                  <Check className="size-4" />
                </Button>
              ),
              meta: (
                <>
                  {p.client_name && <span>{p.client_name}</span>}
                  <span>
                    {p.last_contacted_on ? formatDate(p.last_contacted_on) : t('people.never')}
                  </span>
                </>
              ),
              footer:
                p.email || p.phone ? (
                  <div
                    className="flex flex-wrap gap-3 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="inline-flex items-center gap-1 text-primary"
                      >
                        <Mail className="size-3" />
                        {p.email}
                      </a>
                    )}
                    {p.phone && (
                      <a
                        href={`tel:${p.phone.replace(/\s/g, '')}`}
                        className="inline-flex items-center gap-1 font-mono text-primary"
                      >
                        <Phone className="size-3" />
                        {p.phone}
                      </a>
                    )}
                  </div>
                ) : undefined,
            })}
          />
        }
      />
    </>
  )
}
