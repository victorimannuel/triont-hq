import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Song, SongInput } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/confirm'
import { AuditInfo, ErrorNote, Field, NameInput, PageHeader, Spinner } from '@/components/bits'

const blank: SongInput = {
  title: '',
  artist: '',
  key: '',
  tempo: 0,
  part: '',
  body: '',
  notes: '',
}

/**
 * Typing a chart in. The body is a plain textarea on purpose: whatever gets
 * typed is what gets stored and what gets played from, with no editor in the
 * middle deciding it knows better where a chord belongs.
 */
export default function SongForm() {
  const { id } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<SongInput>(blank)
  const [record, setRecord] = useState<Song | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .song(Number(id))
      .then((song) => {
        setRecord(song)
        setForm({
          title: song.title,
          artist: song.artist,
          key: song.key,
          tempo: song.tempo,
          part: song.part,
          body: song.body,
          notes: song.notes,
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('song.failed')))
  }, [id, t])

  function set<K extends keyof SongInput>(key: K, value: SongInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const saved = id ? await api.updateSong(Number(id), form) : await api.createSong(form)
      navigate(`/songs/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !record) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: record.title }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: record.title }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return

    try {
      await api.deleteSong(Number(id))
      navigate('/songs')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.deleteFailed'))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={id ? `/songs/${id}` : '/songs'}
        title={id ? form.title || t('song.edit') : t('song.new')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('song.songTitle')} htmlFor="title">
                <NameInput
                  id="title"
                  required
                  autoFocus
                  value={form.title}
                  onValue={(v) => set('title', v)}
                />
              </Field>
              <Field label={t('song.artist')} htmlFor="artist">
                <NameInput
                  id="artist"
                  value={form.artist}
                  onValue={(v) => set('artist', v)}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label={t('song.key')} htmlFor="key" hint={t('song.keyHint')}>
                <Input
                  id="key"
                  value={form.key}
                  onChange={(event) => set('key', event.target.value)}
                  placeholder="C"
                  className="font-mono"
                />
              </Field>
              <Field label={t('song.tempo')} htmlFor="tempo">
                <Input
                  id="tempo"
                  type="number"
                  min={0}
                  max={400}
                  value={form.tempo || ''}
                  onChange={(event) => set('tempo', Number(event.target.value) || 0)}
                />
              </Field>
              <Field label={t('song.part')} hint={t('song.partHint')}>
                <Select
                  value={form.part || 'both'}
                  onValueChange={(v) => set('part', v === 'both' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{t('song.partBoth')}</SelectItem>
                    {meta.song_parts.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {tOpt('songpart', item.value, item.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={t('song.chart')} htmlFor="body" hint={t('song.chartHint')}>
              {/* Monospace here as well as on the sheet, so what gets lined up
                  while typing is what gets read on the night. */}
              <Textarea
                id="body"
                value={form.body}
                onChange={(event) => set('body', event.target.value)}
                rows={16}
                spellCheck={false}
                className="font-mono whitespace-pre"
                placeholder={'Intro   | C | G | Am | F |\n\nVerse\nC          G\nlirik di sini'}
              />
            </Field>

            <Field label={t('song.notes')} htmlFor="notes">
              <Input
                id="notes"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder={t('song.notesHint')}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t('common.save')}
              </Button>
              {id && (
                <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </form>

          {record && (
            <AuditInfo
              createdBy={record.created_by}
              createdAt={record.created_at}
              updatedBy={record.updated_by}
              updatedAt={record.updated_at}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
