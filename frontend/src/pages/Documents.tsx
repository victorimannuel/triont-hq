import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Eye, EyeOff, FileText, Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useFiles } from '@/lib/useFileCounts'
import { useRemembered } from '@/lib/useRemembered'
import { useReveal } from '@/lib/useReveal'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Document } from '@/types'
import { Button } from '@/components/ui/button'
import { ErrorNote, Mark, PageHeader, RenewalBadge, Segmented } from '@/components/bits'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FileCount } from '@/components/Files'
import { SearchInput, FilterSelect } from '@/components/filters'
import { RowList } from '@/components/cards'

const VIEWS = ['gallery', 'list'] as const

export default function Documents() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'kind', 'holder'], api.documents, {
    documents: [] as Document[],
    holders: [] as string[],
  })
  const { loading, error, query, filtered, update, clear } = list
  const { counts: fileCounts, covers } = useFiles('document')
  /*
  Gallery first.

  A document is recognised by the look of it long before its name is read, so
  the scan on the front of a card finds the right one faster than a column of
  titles does. The list is still here for when the numbers and the storage
  places matter more than the picture, and whichever was used last is what
  opens next time.
  */
  const [view, setView] = useRemembered('hq-documents-view', VIEWS, 'gallery')
  const documents = list.data.documents
  const holders = list.data.holders

  const fetchNumber = useCallback(
    async (id: number) => (await api.revealDocument(id)).number,
    [],
  )
  const { shown, reveal, copy: copyValue } = useReveal(fetchNumber, t('doc.revealFailed'))
  // The document whose scan is being looked at, or null.
  const [showing, setShowing] = useState<Document | null>(null)
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
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'gallery', label: t('doc.viewGallery') },
            { value: 'list', label: t('doc.viewList') },
          ]}
        />
      </div>

      {view === 'gallery' &&
        (documents.length === 0 ? (
          <Card className="py-10 text-center text-muted-foreground">
            {loading ? null : t('doc.none')}
          </Card>
        ) : (
          /*
          Sized by the card rather than by counting columns: a fixed column
          count is a guess about a screen width, and this page is read on a
          phone and on a monitor.

          Two floors, though, because one does not fit both, and both are
          worked out against the width that is actually there. A phone is
          375px with 16px of padding either side and 8px between cards, so
          three fit only if each may go down to 6.5rem. The page proper is
          960px with 12px gaps, where 9rem lands on six and a seventh does
          not go.
          */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:gap-3">
            {documents.map((d) => (
              <div
                key={d.id}
                className="card-surface overflow-hidden rounded-xl border"
              >
                {/* Tapping the picture shows the picture, which is what a
                    picture invites. Tapping the words below opens the record,
                    which is what words are for. Guessing one meaning for the
                    whole card would have got one of the two wrong. */}
                {covers[d.id] ? (
                  <button
                    type="button"
                    onClick={() => setShowing(d)}
                    aria-label={d.name}
                    className="block aspect-[4/3] w-full overflow-hidden bg-muted/40 transition-opacity hover:opacity-80"
                  >
                    <img
                      src={api.downloadUrl(covers[d.id])}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </button>
                ) : (
                  // Nothing to preview, so the blank goes where the words go.
                  // A document with no scan is what this view is worst at, and
                  // it says so rather than pretending.
                  <button
                    type="button"
                    onClick={() => navigate(`/documents/${d.id}`)}
                    aria-label={d.name}
                    className="grid aspect-[4/3] w-full place-items-center bg-muted/40 transition-colors hover:bg-accent"
                  >
                    <FileText className="size-8 text-muted-foreground/60" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate(`/documents/${d.id}`)}
                  className="block w-full space-y-1 p-2 text-left transition-colors hover:bg-accent sm:p-3">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                    {[tOpt('dockind', d.kind), d.holder].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <RenewalBadge renewsOn={d.expires_on} />
                    <span className={cn('ml-auto', !fileCounts[d.id] && 'hidden')}>
                      <FileCount n={fileCounts[d.id]} />
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        ))}

      {view === 'list' && (

      <RowList
        items={documents}
        keyOf={(d) => d.id}
        onPick={(d) => navigate(`/documents/${d.id}`)}
        empty={loading ? null : t('doc.none')}
        render={(d) => ({
          leading: <Mark name={d.name} />,
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
      )}

      {/* Full size without leaving the page. Opening the record is a click
          away in here too, for when the scan turns out to be the wrong one. */}
      <Dialog open={showing !== null} onOpenChange={(open) => !open && setShowing(null)}>
        <DialogContent className="max-w-[min(56rem,95vw)]">
          <DialogTitle className="truncate lowercase">{showing?.name}</DialogTitle>
          <DialogDescription>
            {showing
              ? [tOpt('dockind', showing.kind), showing.holder].filter(Boolean).join(' · ')
              : ''}
          </DialogDescription>
          {showing && (
            <>
              <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30">
                <img
                  src={api.downloadUrl(covers[showing.id])}
                  alt={showing.name}
                  className="mx-auto block max-w-full"
                />
              </div>
              <div>
                <Button variant="outline" onClick={() => navigate(`/documents/${showing.id}`)}>
                  {t('doc.openRecord')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
