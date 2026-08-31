import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Eye, EyeOff, Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useFileCounts } from '@/lib/useFileCounts'
import { useReveal } from '@/lib/useReveal'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Document } from '@/types'
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
import { ErrorNote, PageHeader, RenewalBadge } from '@/components/bits'
import { FileCount } from '@/components/Files'
import { SearchInput, FilterSelect } from '@/components/filters'
import { CardList, Responsive } from '@/components/cards'

export default function Documents() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'kind', 'holder'], api.documents, {
    documents: [] as Document[],
    holders: [] as string[],
  })
  const { loading, error, query, filtered, update, clear } = list
  const fileCounts = useFileCounts('document')
  const documents = list.data.documents
  const holders = list.data.holders

  const fetchNumber = useCallback(
    async (id: number) => (await api.revealDocument(id)).number,
    [],
  )
  const { shown, reveal, copy: copyValue } = useReveal(fetchNumber, t('doc.revealFailed'))
  const copy = (id: number) => copyValue(id, t('common.copied'), t('common.copyFailed'))

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
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('doc.searchPlaceholder')}
        />
        <FilterSelect
          label={t('common.kind')}
          value={query.kind}
          onChange={(v) => update('kind', v)}
          options={meta.document_kinds.map((item) => ({
            value: item.value,
            label: tOpt('dockind', item.value, item.label),
          }))}
        />
        <FilterSelect
          label={t('doc.holder')}
          value={query.holder}
          onChange={(v) => update('holder', v)}
          options={holders.map((h) => ({ value: h, label: h }))}
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
                      <div className="flex items-center gap-2 font-medium">
                        {doc.name}
                        <FileCount n={fileCounts[doc.id]} />
                      </div>
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
                  <FileCount n={fileCounts[d.id]} />
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
