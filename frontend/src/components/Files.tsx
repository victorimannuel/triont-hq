import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, GripVertical, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Attachment } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, formatDate, SectionTitle, Spinner } from '@/components/bits'
import { cn } from '@/lib/utils'

/**
 * Files belonging to one record. The bytes are encrypted in the database with
 * the same key as credential secrets, so a scan of a passport is not sitting
 * readable in a backup — which also means every view of one is a round trip,
 * and none of it is cached.
 */
const human = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function Files({
  entity,
  id,
  title,
  hint,
}: {
  entity: string
  id: number
  /** What this card is holding, when "attachments" is not the word for it. */
  title?: string
  hint?: string
}) {
  const { t } = useT()
  const confirm = useConfirm()
  const picker = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The image being looked at, or null. A scan is opened to be read, and a
  // browser tab means leaving the record it belongs to.
  const [showing, setShowing] = useState<Attachment | null>(null)
  // The card being dragged, by id. Null the rest of the time.
  const [dragging, setDragging] = useState<number | null>(null)

  /*
  Dropping one card onto another puts it in that card's place.

  The order is worth keeping because the first image is the one a gallery shows
  on the front of the record, so "which of these is the good photo of it" is a
  real question with a real answer. The list is reordered on screen first and
  the server is told after: the answer is already known locally, and waiting a
  round trip to see a card move is what makes dragging feel broken.
  */
  async function drop(targetID: number) {
    const from = files.findIndex((f) => f.id === dragging)
    const to = files.findIndex((f) => f.id === targetID)
    setDragging(null)
    if (from < 0 || to < 0 || from === to) return

    const next = [...files]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setFiles(next)
    try {
      await api.reorderAttachments(entity, id, next.map((f) => f.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('file.reorderFailed'))
      load()
    }
  }

  const load = useCallback(() => {
    api
      .attachments(entity, id)
      .then((data) => setFiles(data.attachments))
      .catch((err) => setError(err.message))
  }, [entity, id])

  useEffect(load, [load])

  async function upload(chosen: FileList | null) {
    if (!chosen?.length) return
    setBusy(true)
    setError('')
    try {
      // One at a time: the size limit is per file, and a failure halfway
      // through should say which one rather than which batch.
      for (const file of Array.from(chosen)) {
        await api.upload(entity, id, file)
      }
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('file.uploadFailed'))
    } finally {
      setBusy(false)
      if (picker.current) picker.current.value = ''
    }
  }

  async function remove(file: Attachment) {
    const ok = await confirm({
      title: t('file.removeTitle', { name: file.name }),
      body: t('file.removeBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return

    try {
      await api.deleteAttachment(file.id)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('file.removeFailed'))
    }
  }

  return (
    <>
      <SectionTitle hint={hint ?? t('file.hint')}>{title ?? t('file.title')}</SectionTitle>

      <Card className="mb-6">
        <CardContent className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}

          <div>
            <input
              ref={picker}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            {/* Worded. This is the one thing the card is for, and an arrow
                into a tray turned out to read as decoration rather than as
                something you press. */}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              {busy ? <Spinner /> : <Upload className="size-4" />}
              {busy ? t('file.uploading') : t('file.add')}
            </Button>
          </div>

          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('file.none')}</p>
          ) : (
            // Sized against the card that holds it rather than the window:
            // this list appears in a narrow column beside a form as often as
            // it does across a whole page.
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
              {files.map((file) => {
                const image = file.mime_type.startsWith('image/')
                return (
                  <div
                    key={file.id}
                    draggable
                    onDragStart={() => setDragging(file.id)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void drop(file.id)}
                    className={cn(
                      'group relative overflow-hidden rounded-lg border transition-opacity',
                      dragging === file.id && 'opacity-40',
                    )}
                  >
                    {/* The handle is a hint, not the only way in: the whole
                        card is draggable, and on a phone, where none of this
                        works at all, it simply is not drawn. */}
                    <span className="pointer-events-none absolute left-1 top-1 hidden rounded bg-background/80 p-0.5 text-muted-foreground sm:group-hover:block">
                      <GripVertical className="size-3.5" />
                    </span>
                    {/* The picture itself rather than a symbol standing in for
                        one, loaded lazily: the bytes are decrypted per request
                        and a record can hold a dozen of these. Anything that
                        is not an image keeps its icon and opens in a tab,
                        because there is nothing to show inline. */}
                    {image ? (
                      <button
                        type="button"
                        onClick={() => setShowing(file)}
                        aria-label={file.name}
                        className="block aspect-[4/3] w-full bg-muted/40 transition-opacity hover:opacity-80"
                      >
                        <img
                          src={api.downloadUrl(file.id)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      </button>
                    ) : (
                      <a
                        href={api.downloadUrl(file.id)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={file.name}
                        className="grid aspect-[4/3] w-full place-items-center bg-muted/40 transition-colors hover:bg-muted"
                      >
                        <FileText className="size-8 text-muted-foreground" />
                      </a>
                    )}

                    <div className="flex items-center gap-1 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{file.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {human(file.size)} · {formatDate(file.created_at)}
                        </p>
                      </div>
                      {/* Always drawn rather than appearing on hover: half of
                          these cards are read on a phone, where there is no
                          hover to reveal anything with. */}
                      <Button variant="ghost" size="icon" className="size-7 shrink-0" asChild>
                        <a
                          href={api.downloadUrl(file.id)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('file.open')}
                        >
                          <Download className="size-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => remove(file)}
                        aria-label={t('file.removeTitle', { name: file.name })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full size, still on the page it belongs to. The height is capped
          against the viewport so a tall scan scrolls inside the box rather
          than pushing everything else off the bottom of the screen. */}
      <Dialog open={showing !== null} onOpenChange={(open) => !open && setShowing(null)}>
        <DialogContent className="max-w-[min(56rem,95vw)]">
          <DialogTitle className="truncate">{showing?.name}</DialogTitle>
          <DialogDescription>
            {showing ? `${human(showing.size)} · ${formatDate(showing.created_at)}` : ''}
          </DialogDescription>
          {showing && (
            <>
              <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30">
                <img
                  src={api.downloadUrl(showing.id)}
                  alt={showing.name}
                  className="mx-auto block max-w-full"
                />
              </div>
              <div>
                <Button variant="outline" asChild>
                  <a
                    href={api.downloadUrl(showing.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('file.open')}
                  >
                    <Download className="size-4" />
                    {t('file.open')}
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A paperclip for a list row, when the record carries files. */
export function FileCount({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Paperclip className="size-3" />
      {n}
    </span>
  )
}
