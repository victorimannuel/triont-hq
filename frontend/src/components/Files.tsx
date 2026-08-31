import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Attachment } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, formatDate, SectionTitle, Spinner } from '@/components/bits'

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

export function Files({ entity, id }: { entity: string; id: number }) {
  const { t } = useT()
  const confirm = useConfirm()
  const picker = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      <SectionTitle hint={t('file.hint')}>{t('file.title')}</SectionTitle>

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
            <div className="space-y-2">
              {files.map((file) => {
                const Icon = file.mime_type.startsWith('image/') ? ImageIcon : FileText
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-md border p-2.5"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {human(file.size)} · {formatDate(file.created_at)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={api.downloadUrl(file.id)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('file.open')}
                      >
                        <Download className="size-4" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(file)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
