import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Settings2, SquarePen, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Option, TrackerInput, TrackerTask } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ErrorNote, Mark, PageHeader } from '@/components/bits'
import { SearchInput, FilterSelect } from '@/components/filters'
import { RowList } from '@/components/cards'
import { useConfirm } from '@/components/confirm'

// The labels come off the server's option lists rather than a second copy here,
// so priority/project/owner/status/company always read the same as the dropdowns.
const labelOf = (options: Option[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value

// Loud at the top, quiet below. Only the two that need to shout carry a colour.
const PRIORITY_TONE: Record<string, string> = {
  urgent: 'bg-destructive/15 text-destructive',
  high: 'bg-warning/15 text-warning',
}

// The editable fields a row carries, so an inline change can PUT the whole task
// with one field swapped.
function toInput(t: TrackerTask): TrackerInput {
  return {
    priority: t.priority,
    project: t.project,
    area: t.area,
    task: t.task,
    owner: t.owner,
    status: t.status,
    company: t.company,
    next_step: t.next_step,
    comment: t.comment,
  }
}

// A dropdown cell that opens the app's own Select panel — the same one the rest
// of HQ uses — instead of the browser's native menu, so the table reads as part
// of the app. The trigger is pared back to sit flush in a cell; the panel that
// drops is the shared, styled one.
function CellSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  label: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className="w-full border-transparent bg-transparent px-1.5 shadow-none hover:bg-accent focus-visible:ring-1"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function Tracker() {
  const meta = useMeta()
  const { t } = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const list = useList(['q', 'status', 'owner', 'project', 'company'], api.tracker, {
    tasks: [] as TrackerTask[],
  })
  const { loading, error, query, update, reload } = list
  const [, setParams] = useSearchParams()

  // Back to the project cards. Whatever the drill-in set is dropped, but the
  // company pill chosen on the landing is kept — it scopes the whole page, not a
  // single project's view.
  function backToProjects() {
    const next = new URLSearchParams()
    if (query.company) next.set('company', query.company)
    setParams(next)
  }

  /*
  A local copy to edit against. The desktop table writes into it on every
  keystroke and saves on blur, so a row never jumps back to the server's value
  mid-edit. Re-synced whenever a fetch or a filter brings a new list.
  */
  const [rows, setRows] = useState<TrackerTask[]>(list.data.tasks)
  useEffect(() => setRows(list.data.tasks), [list.data.tasks])

  // Latest rows for the save handlers to read without a stale closure.
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // What a text cell held when it was focused, so blur only saves a real edit
  // rather than firing on every tab-through.
  const before = useRef('')

  async function save(id: number, changes: Partial<TrackerInput>) {
    const current = rowsRef.current.find((r) => r.id === id)
    if (!current) return
    const input = { ...toInput(current), ...changes }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)))
    try {
      await api.updateTracker(id, input)
    } catch {
      toast.error(t('common.failed'))
      reload()
    }
  }

  function edit(id: number, changes: Partial<TrackerTask>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }

  async function remove(row: TrackerTask) {
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: row.task }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    try {
      await api.deleteTracker(row.id)
    } catch {
      toast.error(t('common.failed'))
      reload()
    }
  }

  const cell = 'w-full rounded bg-transparent px-1.5 py-1 hover:bg-accent focus:bg-accent focus:outline-none focus:ring-1 focus:ring-ring'

  // No project picked yet means the landing view: a square per project rather
  // than every task at once. Picking one sets the filter and the table takes
  // over. The counts come off the full list, which is what is loaded whenever no
  // project filter is on.
  const showOverview = !query.project
  const projectCards = meta.tracker_projects
    .map((p) => {
      const tasks = list.data.tasks.filter((tk) => tk.project === p.value)
      const openTasks = tasks.filter((tk) => tk.status !== 'done')
      return {
        value: p.value,
        label: p.label,
        total: tasks.length,
        open: openTasks.length,
        urgent: openTasks.filter((tk) => tk.priority === 'urgent').length,
      }
    })
    // A project with nothing in it is not worth a tile; general often sits empty.
    .filter((c) => c.total > 0)

  return (
    <>
      <PageHeader
        title={t('tracker.title')}
        description={
          loading
            ? t('common.loading')
            : showOverview
              ? t('tracker.pickProject')
              : `${labelOf(meta.tracker_projects, query.project)} · ${t('tracker.count', { n: rows.length })}`
        }
        action={
          <Button asChild>
            <Link to="/tracker/new">
              <Plus className="size-4" />
              {t('tracker.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {showOverview ? (
        <>
          {/* Company as pills across the top: the scope the whole landing sits
              in, above the project cards. */}
          {meta.tracker_companies.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => update('company', '')}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                  query.company
                    ? 'border-border text-muted-foreground hover:bg-accent'
                    : 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {t('tracker.allCompanies')}
              </button>
              {meta.tracker_companies.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => update('company', item.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    query.company === item.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {item.label}
                </button>
              ))}
              {/* Add, rename or remove the companies these pills come from. */}
              <Button asChild variant="ghost" size="sm" className="ml-auto text-muted-foreground">
                <Link to="/tracker/companies">
                  <Settings2 className="size-3.5" />
                  {t('tracker.manageCompanies')}
                </Link>
              </Button>
            </div>
          )}
          {projectCards.length === 0 && !loading ? (
            <div className="rounded-xl border py-16 text-center text-muted-foreground">
              {t('tracker.none')}
            </div>
          ) : (
          /*
            One square per project, the count that matters on it. The first thing
            asked on opening the tracker is "which project", so that is what it
            shows; tapping a card drops into that project's tasks.
          */
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {projectCards.map((card) => (
              <button
                key={card.value}
                type="button"
                onClick={() => update('project', card.value)}
                className="flex aspect-square flex-col justify-between rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{card.label}</span>
                  {card.urgent > 0 && (
                    <Badge
                      variant="outline"
                      className={cn('border-transparent font-medium', PRIORITY_TONE.urgent)}
                    >
                      {card.urgent}
                    </Badge>
                  )}
                </div>
                {card.open > 0 ? (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-semibold tabular-nums">{card.open}</span>
                      <span className="text-sm text-muted-foreground">{t('tracker.active')}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('tracker.totalTasks', { n: card.total })}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{t('tracker.allDone')}</div>
                )}
              </button>
            ))}
          </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={backToProjects}>
              <ArrowLeft className="size-4" />
              {t('tracker.allProjects')}
            </Button>
            <SearchInput
              value={query.q}
              onChange={(v) => update('q', v)}
              placeholder={t('tracker.searchPlaceholder')}
            />
            <FilterSelect
              label={t('tracker.status')}
              value={query.status}
              onChange={(v) => update('status', v)}
              options={meta.tracker_statuses.map((item) => ({ value: item.value, label: item.label }))}
            />
            <FilterSelect
              label={t('tracker.owner')}
              value={query.owner}
              onChange={(v) => update('owner', v)}
              options={meta.tracker_owners.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>

      {/*
        Desktop: the spreadsheet it replaces. Every cell edits in place and
        saves the moment it changes; the pencil opens the full form for the
        fields too long to live in a row — the comment, and the rest.
      */}
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 font-medium">{t('tracker.priority')}</th>
              <th className="px-2 py-2 font-medium">{t('tracker.project')}</th>
              <th className="px-2 py-2 font-medium">{t('tracker.task')}</th>
              <th className="px-2 py-2 font-medium">{t('tracker.owner')}</th>
              <th className="px-2 py-2 font-medium">{t('tracker.status')}</th>
              {/* Area and Company are hidden here to keep the row scannable;
                  both still live on the form. */}
              <th className="px-2 py-2 font-medium">{t('tracker.nextStep')}</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-middle hover:bg-muted/20">
                <td className="px-1 py-1">
                  <CellSelect
                    value={row.priority}
                    onChange={(v) => save(row.id, { priority: v })}
                    options={meta.tracker_priorities}
                    label={t('tracker.priority')}
                  />
                </td>
                <td className="px-1 py-1">
                  <CellSelect
                    value={row.project}
                    onChange={(v) => save(row.id, { project: v })}
                    options={meta.tracker_projects}
                    label={t('tracker.project')}
                  />
                </td>
                <td className="min-w-[14rem] px-1 py-1">
                  <input
                    className={cell}
                    value={row.task}
                    onFocus={(e) => (before.current = e.target.value)}
                    onChange={(e) => edit(row.id, { task: e.target.value })}
                    onBlur={(e) => {
                      if (e.target.value !== before.current) save(row.id, { task: e.target.value })
                    }}
                  />
                </td>
                <td className="px-1 py-1">
                  <CellSelect
                    value={row.owner}
                    onChange={(v) => save(row.id, { owner: v })}
                    options={meta.tracker_owners}
                    label={t('tracker.owner')}
                  />
                </td>
                <td className="px-1 py-1">
                  <CellSelect
                    value={row.status}
                    onChange={(v) => save(row.id, { status: v })}
                    options={meta.tracker_statuses}
                    label={t('tracker.status')}
                  />
                </td>
                <td className="min-w-[10rem] px-1 py-1">
                  <input
                    className={cell}
                    value={row.next_step}
                    placeholder="—"
                    onFocus={(e) => (before.current = e.target.value)}
                    onChange={(e) => edit(row.id, { next_step: e.target.value })}
                    onBlur={(e) => {
                      if (e.target.value !== before.current)
                        save(row.id, { next_step: e.target.value })
                    }}
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {/* The pencil opens the full form: comment, and a roomier
                      edit of everything above. */}
                  <Link
                    to={`/tracker/${row.id}`}
                    aria-label={t('common.edit')}
                    title={t('common.edit')}
                    className="inline-grid size-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <SquarePen className="size-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                    className="inline-grid size-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  {t('tracker.none')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/*
        Phone: the card, tapped to open the full form. Editing a cell under a
        thumb is a mis-tap waiting to happen, so the small screen keeps the form.
      */}
      <div className="sm:hidden">
        <RowList
          items={rows}
          keyOf={(s) => String(s.id)}
          onPick={(s) => navigate(`/tracker/${s.id}`)}
          empty={loading ? null : t('tracker.none')}
          render={(s) => ({
            leading: <Mark name={s.task} />,
            title: s.task,
            subtitle: s.next_step ? `→ ${s.next_step}` : s.area || undefined,
            meta: (
              <>
                <Badge
                  variant="outline"
                  className={cn('border-transparent font-medium', PRIORITY_TONE[s.priority])}
                >
                  {labelOf(meta.tracker_priorities, s.priority)}
                </Badge>
                <Badge variant="outline">{labelOf(meta.tracker_statuses, s.status)}</Badge>
                <span>{labelOf(meta.tracker_owners, s.owner)}</span>
                <span className="text-muted-foreground">
                  {labelOf(meta.tracker_projects, s.project)}
                </span>
                {s.company && (
                  <span className="text-muted-foreground">
                    {labelOf(meta.tracker_companies, s.company)}
                  </span>
                )}
              </>
            ),
          })}
        />
      </div>
        </>
      )}
    </>
  )
}
