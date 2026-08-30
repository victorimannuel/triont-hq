import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Client } from '@/types'
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
import { ErrorNote, PageHeader } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

const ALL = '__all__'

export default function Clients() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const query = { q: params.get('q') ?? '', status: params.get('status') ?? '' }
  const filtered = Boolean(query.q || query.status)

  useEffect(() => {
    setLoading(true)
    api
      .clients(query)
      .then((data) => {
        setClients(data.clients)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

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
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('client.searchPlaceholder')}
            value={query.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <Select value={query.status || ALL} onValueChange={(v) => update('status', v)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {meta.client_statuses.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('clientstatus', item.value, item.label)}
              </SelectItem>
            ))}
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
