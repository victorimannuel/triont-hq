import { Link, useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Client } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorNote, Mark, PageHeader } from '@/components/bits'
import { SearchInput, FilterSelect } from '@/components/filters'
import { CardList, Responsive } from '@/components/cards'

export default function Clients() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'status'], api.clients, { clients: [] as Client[] })
  const { loading, error, query, filtered, update, clear } = list
  const clients = list.data.clients

  return (
    <>
      <PageHeader
        title={t('client.title')}
        description={loading ? t('common.loading') : t('client.count', { n: clients.length })}
        action={
          <Button asChild>
            <Link to="/clients/new">
              <Plus className="size-4" />
              {t('client.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('client.searchPlaceholder')}
        />
        <FilterSelect
          label={t('common.status')}
          value={query.status}
          onChange={(v) => update('status', v)}
          options={meta.client_statuses.map((item) => ({
            value: item.value,
            label: tOpt('clientstatus', item.value, item.label),
          }))}
        />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="size-4" />
            {t('common.reset')}
          </Button>
        )}
      </div>

      <Responsive
        table={
          /* Rows rather than a table. Three of the five columns were a kind and
             two tallies, which is a lot of ruled lines around very little —
             and a client is a name first. */
          <Card className="divide-y overflow-hidden py-0">
            {clients.map((client) => (
              <Link
                key={client.id}
                to={`/clients/${client.slug}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
              >
                <Mark name={client.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{client.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {tOpt('clientkind', client.kind)}
                  </div>
                </div>
                {/* The tallies keep their place on a wide screen and drop off a
                    narrow one, where the name and the status matter more. */}
                <div className="hidden shrink-0 gap-4 text-xs text-muted-foreground lg:flex">
                  <span className="tabular-nums">
                    {client.project_count} {t('nav.projects')}
                  </span>
                  <span className="tabular-nums">
                    {client.contact_count} {t('client.contacts')}
                  </span>
                </div>
                <Badge variant="outline" className="shrink-0 font-medium">
                  {tOpt('clientstatus', client.status)}
                </Badge>
              </Link>
            ))}
            {!loading && clients.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                {t('client.none')}{' '}
                <Link to="/clients/new" className="text-primary hover:underline">
                  {t('home.addOne')}
                </Link>
                .
              </div>
            )}
          </Card>
        }
        cards={
          <CardList
            items={clients}
            keyOf={(c) => c.id}
            onPick={(c) => navigate(`/clients/${c.slug}`)}
            empty={loading ? null : t('client.none')}
            render={(c) => ({
              leading: <Mark name={c.name} />,
              title: c.name,
              subtitle: tOpt('clientkind', c.kind),
              trailing: <Badge variant="outline">{tOpt('clientstatus', c.status)}</Badge>,
              meta: (
                <>
                  <span>
                    {c.project_count} {t('nav.projects')}
                  </span>
                  <span>
                    {c.contact_count} {t('client.contacts')}
                  </span>
                </>
              ),
            })}
          />
        }
      />
    </>
  )
}
