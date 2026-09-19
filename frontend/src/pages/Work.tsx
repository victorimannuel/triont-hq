import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { DayWork, Project, ProjectPart, ProjectWork, TimeEntry } from '@/types'
import { setRunning as shareRunning } from '@/lib/running'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/confirm'
import { RowList } from '@/components/cards'
import { ErrorNote, Field, Loading, PageHeader, Spinner } from '@/components/bits'

/**
 * Where the working day went.
 *
 * Several clocks can run at once, because work happens that way — sitting in
 * an RR call while an NPD build runs is two projects and one hour. So the day's
 * total is the sum of what was worked on rather than of how long the chair was
 * warm, and it can come to more than the day is long.
 *
 * The point is not to measure precisely; it is to have an answer to "what did I
 * actually do today" that is not a guess. So everything here can be corrected
 * afterwards and nothing is locked once it has been written.
 */

const NONE = '__none__'

// The day job — Montrichard HK, "MHK" for short. Found by name because that is
// all a project is here: anything that reads as Montrichard is taken, and the
// short "MHK" too, so a rename either way still lands. Undefined when there is
// no such project, which just leaves the picker on nothing.
function findMhk(projects: Project[]): string | undefined {
  const looksMhk = (name: string) => {
    const n = name.trim().toLowerCase()
    return n === 'mhk' || n.includes('montrichard') || n.includes('mhk')
  }
  const hit = projects.find((project) => looksMhk(project.name))
  return hit ? String(hit.id) : undefined
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/*
A stretch of time as it gets said out loud: "2j 15m".

Minutes only under an hour, and no seconds anywhere except on a clock that is
still running — a finished entry counted to the second reads as precision that
is not really there, since the start was whenever the button got pressed.
*/
export function spell(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(mins / 60)
  if (hours === 0) return `${mins}m`
  return `${hours}j ${String(mins % 60).padStart(2, '0')}m`
}

/** A running clock, which does count seconds: it is moving, so it shows it. */
function tick(seconds: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  return `${hours}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

const since = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))

/** An ISO instant as the value a datetime-local input wants. */
function localTime(iso: string) {
  const at = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** "mhk · NPD", or just the project when it has no parts. */
export function where(project: string, part: string, fallback: string) {
  const name = project || fallback
  return part ? `${name} · ${part}` : name
}

/*
The week, as bars.

Scaled to the longest day rather than to a target. There is no target here —
inventing one would be inventing a verdict about a day that might have been a
Sunday.
*/
function Week({ days, on, onPick }: { days: DayWork[]; on: string; onPick: (day: string) => void }) {
  const { t } = useT()
  const top = Math.max(1, ...days.map((day) => day.seconds))
  const worked = days.filter((day) => day.seconds > 0)
  const average = worked.length
    ? worked.reduce((sum, day) => sum + day.seconds, 0) / worked.length
    : 0

  return (
    <Card className="mb-4 py-0">
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium lowercase">{t('work.week')}</p>
          {average > 0 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {t('work.perDay', { n: spell(average) })}
            </p>
          )}
        </div>
        <div className="flex items-end gap-1.5">
          {days.map((day) => (
            <button
              key={day.on}
              type="button"
              onClick={() => onPick(day.on)}
              className="flex flex-1 flex-col items-center gap-1"
              aria-label={day.on}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {day.seconds > 0 ? spell(day.seconds) : ''}
              </span>
              <span
                className={cn(
                  'w-full rounded-sm transition-all',
                  day.on === on ? 'bg-primary' : 'bg-primary/25',
                )}
                // A day with nothing on it still gets a sliver, so a gap reads
                // as a gap rather than as the chart having nothing to say.
                style={{ height: `${Math.max(2, (day.seconds / top) * 56)}px` }}
              />
              <span className="text-[10px] text-muted-foreground">
                {new Date(`${day.on}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** Where the window's hours went, split by part, as bars against the biggest. */
export function ByProject({ projects }: { projects: ProjectWork[] }) {
  const { t } = useT()
  if (projects.length === 0) return null
  const top = Math.max(1, ...projects.map((row) => row.seconds))

  return (
    <Card className="mb-4 py-0">
      <CardContent className="space-y-2.5 px-4 py-4">
        <p className="text-sm font-medium lowercase">{t('work.byProject')}</p>
        {projects.map((row) => (
          <div key={`${row.project_id ?? 0}|${row.part}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">
                {where(row.project, row.part, t('work.noProject'))}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {spell(row.seconds)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary/60"
                style={{ width: `${Math.max(2, (row.seconds / top) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/*
One clock that is going.

Its own card rather than a row in the list, because stopping it is the only
thing on this page anybody is ever in a hurry to do.
*/
function RunningCard({
  entry,
  ticks,
  onEdit,
  onStop,
  onDelete,
}: {
  entry: TimeEntry
  ticks: number
  onEdit: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const { t } = useT()
  void ticks

  return (
    <Card className="mb-2 py-0">
      <CardContent className="flex items-center gap-3 px-4 py-4">
        {/* The name doubles as the way in to correct the clock while it runs —
            the wrong project picked, a note to add. Not lowercased, unlike most
            titles here: the part is an acronym and "afs" is not what anybody
            calls it. */}
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left transition-opacity hover:opacity-70"
          aria-label={t('common.edit')}
          title={t('common.edit')}
        >
          <p className="truncate font-medium">
            {where(entry.project, entry.part, t('work.noProject'))}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.note || t('work.sinceWhen', { at: clock(entry.started_at) })}
          </p>
        </button>
        <p className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight">
          {tick(since(entry.started_at))}
        </p>
        {/* Correcting the running clock in full — project, part, note, start —
            opens the same dialog the list uses. */}
        <Button
          onClick={onEdit}
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t('common.edit')}
        >
          <Pencil className="size-4" />
        </Button>
        {/* Delete, not stop, for a clock the button started by accident:
            stopping it would only leave a stray one-minute entry to hunt down
            and clear later. */}
        <Button
          onClick={onDelete}
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t('common.delete')}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button onClick={onStop} variant="destructive">
          <Square className="size-4" />
          {t('work.stop')}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function Work() {
  const { t } = useT()
  const confirm = useConfirm()

  const [on, setOn] = useState(() => dayKey(new Date()))
  const [entries, setEntries] = useState<TimeEntry[] | null>(null)
  const [running, setRunning] = useState<TimeEntry[]>([])
  const [seconds, setSeconds] = useState(0)
  const [days, setDays] = useState<DayWork[]>([])
  const [byProject, setByProject] = useState<ProjectWork[]>([])
  const [knownParts, setKnownParts] = useState<ProjectPart[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  // What to start next. Kept across a stop so the next stretch on the same job
  // is one tap.
  const [pick, setPick] = useState<string>(NONE)
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')

  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [stopping, setStopping] = useState<TimeEntry | null>(null)

  const load = useCallback(() => {
    api
      .time(on)
      .then((data) => {
        setEntries(data.entries)
        // The shared list too, so the pill agrees the moment one is started or
        // stopped rather than on the next page change.
        shareRunning(data.running)
        setRunning(data.running)
        setSeconds(data.seconds)
        setDays(data.days)
        setByProject(data.projects)
        setKnownParts(data.parts)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('work.failed')))
  }, [on, t])

  useEffect(load, [load])

  useEffect(() => {
    api
      .projects({})
      .then((data) => setProjects(data.projects))
      .catch(() => undefined)
  }, [])

  // The day job is almost always MHK, so the picker starts there rather than on
  // nothing — one tap saved on the entry made twenty times a week. It stays a
  // dropdown: an hour logged against something else now and then is a change of
  // selection, not a different form.
  const mhk = useMemo(() => findMhk(projects), [projects])
  // Once, when the projects arrive, and only while the picker is still on
  // nothing: a deliberate "no project" chosen afterwards is left as it is.
  useEffect(() => {
    if (mhk === undefined) return
    setPick((current) => (current === NONE ? mhk : current))
  }, [mhk])

  /*
  The running clocks count up on their own rather than waiting for the next
  reload. A timer that only moves when something else happens does not read as
  running, which is the one thing those cards exist to say.
  */
  const [ticks, setTicks] = useState(0)
  useEffect(() => {
    if (running.length === 0) return
    const id = window.setInterval(() => setTicks((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [running.length])

  /*
  Everything else catches up once a minute.

  Only the clocks are worth a per-second redraw. But the day's total, the bars
  and the per-project split are all sums that include the running stretches, so
  leaving them at what they said on load would put a headline of two hours above
  a clock that has been going for three — which reads as a bug in the arithmetic
  rather than as a stale number.
  */
  useEffect(() => {
    if (running.length === 0) return
    const id = window.setInterval(load, 60000)
    return () => window.clearInterval(id)
  }, [running.length, load])

  const today = useMemo(() => dayKey(new Date()), [])

  // What the part box offers: the names already used on the project that is
  // selected, so the second entry on NPD is picked rather than spelled again.
  const partsHere = useMemo(() => {
    const id = pick === NONE ? null : Number(pick)
    return knownParts.filter((one) => one.project_id === id).map((one) => one.name)
  }, [knownParts, pick])

  function shift(by: number) {
    const at = new Date(`${on}T00:00:00`)
    at.setDate(at.getDate() + by)
    setOn(dayKey(at))
  }

  async function start() {
    setBusy('start')
    try {
      await api.startTime({
        project_id: pick === NONE ? null : Number(pick),
        part,
        note,
        started_at: '',
        ended_at: '',
      })
      setNote('')
      // Back to today, because that is where the clock just landed.
      setOn(today)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('work.failed'))
    } finally {
      setBusy('')
    }
  }

  /*
  A clock is stopped from a dialog rather than a bare confirm, because the end
  is worth a look before it is written: the button sits next to a clock that may
  have been left running through lunch, and fixing the end right there is what
  saves the stop-then-hunt-for-the-entry-and-edit-it it used to take. The dialog
  owns the write; this only tidies up after a good one.
  */
  function stopped(entry: TimeEntry) {
    setStopping(null)
    // The job stays in the boxes, so carrying on after a break is one tap.
    setPick(entry.project_id ? String(entry.project_id) : NONE)
    setPart(entry.part)
    load()
  }

  /*
  Carrying on with something from earlier starts a fresh stretch rather than
  reopening the old one.

  Reopening would be the obvious thing and the wrong one: the length of an
  entry is its end minus its start, so putting lunch back inside it counts the
  break as work. Two rows keep the number right and keep the log honest about
  which hours were actually at the desk. What adds them back up is the summary,
  which is where anybody asks "how long on NPD" anyway.
  */
  async function resume(entry: TimeEntry) {
    setBusy(`resume-${entry.id}`)
    try {
      await api.startTime({
        project_id: entry.project_id,
        part: entry.part,
        note: entry.note,
        started_at: '',
        ended_at: '',
      })
      // The boxes follow, so they agree with what is now running.
      setPick(entry.project_id ? String(entry.project_id) : NONE)
      setPart(entry.part)
      setNote(entry.note)
      setOn(today)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('work.failed'))
    } finally {
      setBusy('')
    }
  }

  /*
  A manual entry opens the same dialog an edit does, on a row that does not
  exist yet. An hour written down afterwards is not a different kind of thing
  from an hour that was clocked, so it does not get a different form.
  */
  function addManual() {
    const at = new Date(`${on}T09:00:00`)
    const until = new Date(`${on}T10:00:00`)
    setEditing({
      id: 0,
      project_id: pick === NONE ? null : Number(pick),
      project: '',
      part,
      note: '',
      started_at: at.toISOString(),
      ended_at: until.toISOString(),
      seconds: 3600,
      created_by: '',
      updated_by: '',
      created_at: '',
      updated_at: '',
    })
  }

  async function remove(entry: TimeEntry) {
    const ok = await confirm({
      title: t('work.deleteTitle'),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteTime(entry.id)
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('work.failed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (entries === null) return <Loading />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('work.title')}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/waktu/bulan">{t('work.month')}</Link>
            </Button>
            <Button variant="outline" onClick={addManual}>
              <Plus className="size-4" />
              {t('work.manual')}
            </Button>
          </div>
        }
      />

      {running.map((entry) => (
        <RunningCard
          key={entry.id}
          entry={entry}
          ticks={ticks}
          onEdit={() => setEditing(entry)}
          onStop={() => setStopping(entry)}
          onDelete={() => remove(entry)}
        />
      ))}

      {/* The start form stays put whether or not anything is running, because
          another clock can always go on beside the ones that are. */}
      <Card className="mb-4 py-0">
        <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <Select
            value={pick}
            onValueChange={(value) => {
              setPick(value)
              // The old project's part means nothing under the new one.
              setPart('')
            }}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('work.noProject')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={String(project.id)}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PartInput
            value={part}
            onValue={setPart}
            options={partsHere}
            disabled={pick === NONE}
            className="w-full sm:w-32"
          />

          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('work.notePlaceholder')}
            className="flex-1"
          />
          <Button onClick={start} disabled={busy === 'start'}>
            {busy === 'start' ? <Spinner /> : <Play className="size-4" />}
            {t('work.start')}
          </Button>
        </CardContent>
      </Card>

      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="-1">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="font-medium lowercase">
            {on === today
              ? t('work.today')
              : new Date(`${on}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
          </p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{spell(seconds)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => shift(1)}
          disabled={on >= today}
          aria-label="+1"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Week days={days} on={on} onPick={setOn} />
      <ByProject projects={byProject} />

      {/* The day's entries as the house list rather than a card apiece: one
          surface, rows split by a divider, the row itself opening the editor. A
          stack of identical cards was the one place this page still read as a
          template. */}
      <RowList
        items={entries}
        keyOf={(entry) => entry.id}
        onPick={(entry) => setEditing(entry)}
        empty={t('work.empty')}
        render={(entry) => ({
          title: where(entry.project, entry.part, t('work.noProject')),
          subtitle: entry.note || t('work.noNote'),
          meta: (
            <span className="tabular-nums">
              {clock(entry.started_at)} –{' '}
              {entry.ended_at ? clock(entry.ended_at) : t('work.running')}
            </span>
          ),
          trailing: (
            <>
              <span className="tabular-nums">{spell(entry.seconds)}</span>
              {/* Carrying on is a button, so it stops the click reaching the row
                  and opening the editor. Nothing to carry on with while the
                  clock is still going. */}
              {entry.ended_at && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy === `resume-${entry.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    resume(entry)
                  }}
                  aria-label={t('work.resume')}
                  title={t('work.resume')}
                >
                  {busy === `resume-${entry.id}` ? <Spinner /> : <Play className="size-4" />}
                </Button>
              )}
            </>
          ),
        })}
      />

      <EntryDialog
        entry={editing}
        projects={projects}
        knownParts={knownParts}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
        onDelete={remove}
      />

      <StopDialog entry={stopping} onClose={() => setStopping(null)} onStopped={stopped} />
    </div>
  )
}

/*
Which part of the project, typed or picked.

A native datalist rather than a dropdown, because the list is open-ended: the
parts of a project are whatever has been logged against it before, and a new one
has to be as easy to write as an old one is to choose. The same trick the food
picker uses.
*/
function PartInput({
  value,
  onValue,
  options,
  disabled,
  className,
  id,
}: {
  value: string
  onValue: (value: string) => void
  options: string[]
  disabled?: boolean
  className?: string
  id?: string
}) {
  const { t } = useT()
  // Its own id per instance, or the page's two boxes would share one list.
  const listID = `hq-parts-${id ?? 'start'}`

  return (
    <>
      <Input
        id={id}
        list={listID}
        value={value}
        disabled={disabled}
        onChange={(event) => onValue(event.target.value)}
        placeholder={t('work.partPlaceholder')}
        className={className}
      />
      <datalist id={listID}>
        {options.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}

/*
Stopping a clock, with both ends in reach.

The end fills itself with now, which is what a stop means nine times in ten. The
tenth is the afternoon it was left running through lunch and half the evening —
so both ends are datetime inputs and the length that will be recorded is spelled
out under them. Correcting it here is one dialog instead of the stop, then find
the entry, then edit it that a forgotten stop used to take.
*/
function StopDialog({
  entry,
  onClose,
  onStopped,
}: {
  entry: TimeEntry | null
  onClose: () => void
  onStopped: (entry: TimeEntry) => void
}) {
  const { t } = useT()
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)

  // The start is whatever the clock has been holding; the end is now, ready to
  // accept or to walk back.
  useEffect(() => {
    if (!entry) return
    setFrom(localTime(entry.started_at))
    setUntil(localTime(new Date().toISOString()))
  }, [entry])

  const duration = useMemo(() => {
    if (!from || !until) return null
    const secs = Math.floor((new Date(until).getTime() - new Date(from).getTime()) / 1000)
    return secs > 0 ? spell(secs) : null
  }, [from, until])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!entry) return
    setBusy(true)
    try {
      // Writing an end onto the running entry is what stops it, and it carries
      // any correction to the start in the same call — the project, part and
      // note stay exactly as the clock was started with.
      await api.updateTime(entry.id, {
        project_id: entry.project_id,
        part: entry.part,
        note: entry.note,
        started_at: new Date(from).toISOString(),
        ended_at: new Date(until).toISOString(),
      })
      onStopped(entry)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('work.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="lowercase">{t('work.stopTitle')}</DialogTitle>
        {entry && (
          <p className="-mt-2 text-sm text-muted-foreground">
            {where(entry.project, entry.part, t('work.noProject'))}
          </p>
        )}

        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('work.from')} htmlFor="stop-from">
              <Input
                id="stop-from"
                type="datetime-local"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label={t('work.until')} htmlFor="stop-until">
              <Input
                id="stop-until"
                type="datetime-local"
                required
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('work.duration')}:{' '}
            <span className="font-medium tabular-nums text-foreground">{duration ?? '—'}</span>
          </p>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? <Spinner /> : <Square className="size-4" />}
              {t('work.stop')}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/*
The one form, for both writing an hour down and correcting one.

The end may be left empty, which puts the clock back on — the way to undo a
stop pressed by mistake.
*/
function EntryDialog({
  entry,
  projects,
  knownParts,
  onClose,
  onSaved,
  onDelete,
}: {
  entry: TimeEntry | null
  projects: Project[]
  knownParts: ProjectPart[]
  onClose: () => void
  onSaved: () => void
  onDelete: (entry: TimeEntry) => void
}) {
  const { t } = useT()
  const [pick, setPick] = useState(NONE)
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  // Whether the clock is still running: an entry with no end. A real toggle
  // rather than an empty end box, which only ever read as "forgot to fill in".
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)

  // The day job is MHK, so a fresh manual entry starts there the same as the
  // timer does. An existing one keeps whatever it was logged against, even if
  // that is nothing.
  const mhk = useMemo(() => findMhk(projects), [projects])

  useEffect(() => {
    if (!entry) return
    const fallback = !entry.id ? (mhk ?? NONE) : NONE
    setPick(entry.project_id ? String(entry.project_id) : fallback)
    setPart(entry.part)
    setNote(entry.note)
    setFrom(localTime(entry.started_at))
    setUntil(entry.ended_at ? localTime(entry.ended_at) : '')
    // A new manual entry is a block that already happened, so it opens with an
    // end to fill. An existing one is running exactly when it has no end yet.
    setRunning(entry.id ? !entry.ended_at : false)
  }, [entry, mhk])

  const partsHere = useMemo(() => {
    const id = pick === NONE ? null : Number(pick)
    return knownParts.filter((one) => one.project_id === id).map((one) => one.name)
  }, [knownParts, pick])

  // What the two times come to, said the way the list below says it. Null when
  // the end is missing or lands before the start, so the line can fall back to
  // "still running" rather than print a negative stretch.
  const duration = useMemo(() => {
    if (!from || !until) return null
    const secs = Math.floor((new Date(until).getTime() - new Date(from).getTime()) / 1000)
    return secs > 0 ? spell(secs) : null
  }, [from, until])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!entry) return
    setBusy(true)
    try {
      const input = {
        project_id: pick === NONE ? null : Number(pick),
        part,
        note,
        started_at: new Date(from).toISOString(),
        ended_at: running || !until ? '' : new Date(until).toISOString(),
      }
      // A new entry with no end is a running clock, which is the start
      // endpoint's job — writing it down with createTime is refused, since a
      // manual entry is a block that already finished. Editing keeps its own
      // path: reopening an end there is how a mistaken stop gets undone.
      if (entry.id) await api.updateTime(entry.id, input)
      else if (running) await api.startTime(input)
      else await api.createTime(input)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('work.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogTitle className="lowercase">
          {entry?.id ? t('work.edit') : t('work.manual')}
        </DialogTitle>

        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.project')}>
              <Select
                value={pick}
                onValueChange={(value) => {
                  setPick(value)
                  setPart('')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('work.noProject')}</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('work.part')} htmlFor="work-part" hint={t('work.partHint')}>
              <PartInput
                id="work-part"
                value={part}
                onValue={setPart}
                options={partsHere}
                disabled={pick === NONE}
              />
            </Field>
          </div>

          <Field label={t('work.note')} htmlFor="work-note">
            <Input
              id="work-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('work.notePlaceholder')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('work.from')} htmlFor="work-from">
              <Input
                id="work-from"
                type="datetime-local"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label={t('work.until')} htmlFor="work-until">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={running}
                  onChange={(event) => {
                    setRunning(event.target.checked)
                    if (event.target.checked) setUntil('')
                  }}
                />
                {t('work.running')}
              </label>
              {!running && (
                <Input
                  id="work-until"
                  type="datetime-local"
                  required
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                />
              )}
            </Field>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('work.duration')}:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {running ? t('work.running') : (duration ?? '—')}
            </span>
          </p>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              {t('common.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {entry !== null && entry.id > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => onDelete(entry)}
              >
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
