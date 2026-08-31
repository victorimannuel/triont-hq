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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorNote, PageHeader } from '@/components/bits'
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
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('client.kind')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('nav.projects')}</TableHead>
                  <TableHead className="text-right">{t('client.contacts')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.slug}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">
                      <Link
                        to={`/clients/${client.slug}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tOpt('clientkind', client.kind)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-medium">
                        {tOpt('clientstatus', client.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {client.project_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {client.contact_count}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && clients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t('client.none')}{' '}
                      <Link to="/clients/new" className="text-primary hover:underline">
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
            items={clients}
            keyOf={(c) => c.id}
            onPick={(c) => navigate(`/clients/${c.slug}`)}
            empty={loading ? null : t('client.none')}
            render={(c) => ({
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
