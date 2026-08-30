import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, Eye, EyeOff, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Document } from '@/types'
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
import { ErrorNote, PageHeader, RenewalBadge } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

const ALL = '__all__'
const HIDE_AFTER_MS = 30_000

export default function Documents() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [documents, setDocuments] = useState<Document[]>([])
  const [holders, setHolders] = useState<string[]>([])
  const [shown, setShown] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const timers = useRef<Record<number, number>>({})

  const query = {
    q: params.get('q') ?? '',
    kind: params.get('kind') ?? '',
    holder: params.get('holder') ?? '',
  }
  const filtered = Boolean(query.q || query.kind || query.holder)

  useEffect(() => {
    setLoading(true)
    api
      .documents(query)
      .then((data) => {
        setDocuments(data.documents)
        setHolders(data.holders)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    const pending = timers.current
    return () => Object.values(pending).forEach((id) => window.clearTimeout(id))
  }, [])

  const hide = useCallback((id: number) => {
    window.clearTimeout(timers.current[id])
    delete timers.current[id]
    setShown((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  async function reveal(id: number) {
    if (shown[id] !== undefined) {
      hide(id)
      return
    }
    try {
      const { number } = await api.revealDocument(id)
      setShown((prev) => ({ ...prev, [id]: number }))
      timers.current[id] = window.setTimeout(() => hide(id), HIDE_AFTER_MS)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('doc.revealFailed'))
    }
  }

  async function copy(id: number) {
    try {
      const { number } = await api.revealDocument(id)
      await navigator.clipboard.writeText(number)
      toast.success(t('common.copied'))
    } catch {
      toast.error(t('common.copyFailed'))
    }
  }

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title={t('doc.title')}
        description={
          loading ? t('common.loading') : t('doc.count', { n: documents.length })
        }
        action={
          <Button asChild>
            <Link to="/documents/new">
              <Plus className="size-4" />
              {t('doc.new')}
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
            placeholder={t('doc.searchPlaceholder')}
            value={query.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <Select value={query.kind || ALL} onValueChange={(v) => update('kind', v)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={t('common.kind')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {meta.document_kinds.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('dockind', item.value, item.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.holder || ALL} onValueChange={(v) => update('holder', v)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={t('doc.holder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {holders.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
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
                  <TableHead>{t('common.kind')}</TableHead>
                  <TableHead>{t('doc.holder')}</TableHead>
                  <TableHead>{t('doc.number')}</TableHead>
                  <TableHead>{t('doc.validity')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow
                    key={doc.id}
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="font-medium">{doc.name}</div>
                      {doc.location && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t('doc.storedAt', { where: doc.location })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('dockind', doc.kind)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.holder || '—'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {doc.has_number ? (
                        <div className="flex items-center gap-1">
                          <span className="min-w-[7rem] font-mono text-xs">
                            {shown[doc.id] ?? '••••••••'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => reveal(doc.id)}
                            aria-label={shown[doc.id] !== undefined ? t('common.hide') : t('common.show')}
                          >
                            {shown[doc.id] !== undefined ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copy(doc.id)}
                            aria-label={t('common.copy')}
                          >
                            <Copy className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <RenewalBadge renewsOn={doc.expires_on} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t('doc.none')}{' '}
                      <Link to="/documents/new" className="text-primary hover:underline">
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
            items={documents}
            keyOf={(d) => d.id}
            onPick={(d) => navigate(`/documents/${d.id}`)}
            empty={loading ? null : t('doc.none')}
            render={(d) => ({
              title: d.name,
              subtitle: d.holder || undefined,
              trailing: <RenewalBadge renewsOn={d.expires_on} />,
              meta: (
                <>
                  <span>{tOpt('dockind', d.kind)}</span>
                  {d.location && <span>{t('doc.storedAt', { where: d.location })}</span>}
                </>
              ),
              footer: d.has_number ? (
                <div
                  className="flex flex-1 items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="flex-1 truncate font-mono text-xs">
                    {shown[d.id] ?? '••••••••'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reveal(d.id)}
                    aria-label={shown[d.id] !== undefined ? t('common.hide') : t('common.show')}
                  >
                    {shown[d.id] !== undefined ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copy(d.id)}
                    aria-label={t('common.copy')}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              ) : undefined,
            })}
          />
        }
      />
    </>
  )
}
