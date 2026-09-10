import { useCallback, useEffect, useRef, useState } from 'react'
import { NotebookPen, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { JournalDay } from '@/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ErrorNote, formatDate, Loading, PageHeader, Segmented } from '@/components/bits'
import { Card, CardContent } from '@/components/ui/card'

/**
 * A line a day, and the days you wrote one. Reading it back is the whole
 * point, so this is a list and not a form: today sits at the top with a box
 * open, and everything else is a line you can tap to change your mind about.
 *
 * The date on that top box can be moved back, which is the only way to write
 * for a day you skipped — the list below only holds days that already have a
 * line, so there is nothing there to tap.
 */

const WINDOWS = [
  { value: '30', label: '30h' },
  { value: '90', label: '90h' },
  { value: '365', label: '1th' },
] as const

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function Journal() {
  const { t } = useT()
  const [entries, setEntries] = useState<JournalDay[] | null>(null)
  const [span, setSpan] = useState<'30' | '90' | '365'>('30')
  const [error, setError] = useState('')
  const today = todayKey()
  // Which day the open box writes to. Today until he moves it.
  const [on, setOn] = useState(today)

  const load = useCallback(() => {
    api
      .journal(Number(span))
      .then((data) => {
        setEntries(data.journal)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('journal.failed')))
  }, [span, t])

  useEffect(load, [load])

  async function save(on: string, line: string) {
    try {
      await api.setJournalLine(on, line)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('journal.failed'))
      load()
    }
  }

  const mine = entries ?? []
  const wrote = mine.some((entry) => entry.on === on)
  // Everything except the chosen day, which gets the open box at the top instead.
  const past = mine.filter((entry) => entry.on !== on)
  const line = mine.find((entry) => entry.on === on)?.line ?? ''

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t('journal.title')}
        description={t('journal.subtitle')}
        action={<Segmented value={span} onChange={setSpan} options={WINDOWS} />}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Today, always open and always at the top. A journal you have to find
          the right day in is a journal you stop writing. */}
      <Card className="mb-6">
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {on === today ? t('journal.today') : formatDate(on)}
            </p>
            {/* No future days: this records what happened, and a line dated
                next week is a plan, which the to-do list is already for. */}
            <Input
              type="date"
              value={on}
              max={today}
              aria-label={t('journal.day')}
              onChange={(event) => setOn(event.target.value || today)}
              className="h-8 w-auto text-xs"
            />
          </div>
          <LineBox
            key={on}
            value={line}
            placeholder={t('journal.placeholder')}
            onSave={(next) => save(on, next)}
          />
          {!wrote && <p className="text-xs text-muted-foreground">{t('journal.hint')}</p>}
        </CardContent>
      </Card>

      {entries === null ? (
        <Loading />
      ) : past.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <NotebookPen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('journal.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="divide-y px-0">
            {past.map((entry) => (
              <PastLine key={entry.on} entry={entry} onSave={save} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/*
Saved on the way out, and abandoned on Escape, so a half-typed change costs
nothing.

It grows with what is in it rather than scrolling inside a fixed box: a journal
you cannot see the whole of is one you stop trusting. Enter makes a new line
now that more than one is allowed, so the deliberate save is Ctrl or Cmd with
it — though simply clicking away has always saved and still does, which is how
this actually gets used.
*/
function LineBox({
  value,
  placeholder,
  onSave,
  autoFocus,
}: {
  value: string
  placeholder: string
  onSave: (line: string) => void
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const clean = useRef(value)
  const box = useRef<HTMLTextAreaElement>(null)

  // Measured rather than guessed: reset to nothing first, or the box can only
  // ever get taller, never shorter again.
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // The list re-reads after a save, and a fresh value from the server should
  // land in the box rather than be shadowed by a stale draft.
  useEffect(() => {
    setDraft(value)
    clean.current = value
  }, [value])

  function commit() {
    if (draft.trim() === clean.current.trim()) return
    clean.current = draft
    onSave(draft)
  }

  return (
    <Textarea
      ref={box}
      value={draft}
      autoFocus={autoFocus}
      rows={1}
      maxLength={2000}
      placeholder={placeholder}
      // Nothing to drag: the box is already exactly as tall as its contents.
      className="resize-none overflow-hidden"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          commit()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(clean.current)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function PastLine({
  entry,
  onSave,
}: {
  entry: JournalDay
  onSave: (on: string, line: string) => void
}) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">
        {formatDate(entry.on)}
      </span>
      {editing ? (
        <div className="min-w-0 flex-1">
          <LineBox
            value={entry.line}
            placeholder={t('journal.placeholder')}
            autoFocus
            onSave={(line) => {
              setEditing(false)
              onSave(entry.on, line)
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            'group flex min-w-0 flex-1 items-start gap-2 text-left text-sm',
            'hover:text-primary',
          )}
        >
          {/* Kept as typed. A day written over three lines should read back as
              three lines, not as one long one with the breaks eaten. */}
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{entry.line}</span>
          <Pencil className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      )}
    </div>
  )
}
