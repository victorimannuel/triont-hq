import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, ListChecks, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Supply, Task, TaskKind } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm'
import { daysUntil, ErrorNote, formatDate, Loading, PageHeader } from '@/components/bits'

/**
 * The two lists. A thing to do and a thing to buy are the same row underneath,
 * so they are the same page with a different kind on it — but they are read at
 * different moments, and a shopping list with "bayar pajak motor" in the way is
 * no use standing in a shop. Hence two routes rather than one filtered list.
 *
 * The shopping side also shows what has run low in supplies, because at the
 * shop there is only one list, whatever the app happens to keep it in.
 */
export default function Tasks({ kind }: { kind: TaskKind }) {
  const { t, tOpt } = useT()
  const ask = useConfirm()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [low, setLow] = useState<Supply[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .tasks(kind)
      .then((data) => {
        setTasks(data.tasks)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('tasks.failed')))
  }, [kind, t])

  useEffect(load, [load])

  // Only the shopping list cares, and a failure here is not worth an error
  // banner: the typed-in half of the page still works without it.
  useEffect(() => {
    if (kind !== 'buy') return
    api
      .supplies({ low: '1' })
      .then((data) => setLow(data.supplies))
      .catch(() => setLow([]))
  }, [kind])

  const open = tasks?.filter((task) => !task.done_at) ?? []
  const done = tasks?.filter((task) => task.done_at) ?? []

  // Re-read rather than append. A new line belongs wherever its deadline puts
  // it, and the server is the one that knows the order.
  async function add(title: string, dueOn: string) {
    await api.createTask(kind, { title, due_on: dueOn })
    load()
  }

  // Ticked in place before the request lands. The line going quiet is the whole
  // feedback of a tap, and waiting a round trip for it feels broken.
  async function toggle(task: Task) {
    const done = !task.done_at
    setTasks((list) =>
      (list ?? []).map((row) =>
        row.id === task.id ? { ...row, done_at: done ? new Date().toISOString() : null } : row,
      ),
    )
    try {
      await api.setTaskDone(task.id, done)
    } catch {
      toast.error(t('tasks.failed'))
      load()
    }
  }

  async function rename(task: Task, title: string, dueOn: string) {
    const trimmed = title.trim()
    if (!trimmed || (trimmed === task.title && dueOn === (task.due_on ?? ''))) return
    try {
      await api.updateTask(kind, task.id, { title: trimmed, due_on: dueOn })
      // Same reason as add: moving a deadline moves the line.
      load()
    } catch {
      toast.error(t('tasks.failed'))
      load()
    }
  }

  async function remove(task: Task) {
    if (!(await ask({ title: t('tasks.deleteConfirm', { title: task.title }), danger: true })))
      return
    setTasks((list) => (list ?? []).filter((row) => row.id !== task.id))
    try {
      await api.deleteTask(task.id)
    } catch {
      toast.error(t('tasks.failed'))
      load()
    }
  }

  async function clearDone() {
    if (!(await ask({ title: t('tasks.clearConfirm', { n: done.length }), danger: true }))) return
    setTasks((list) => (list ?? []).filter((row) => !row.done_at))
    try {
      await api.clearDoneTasks(kind)
    } catch {
      toast.error(t('tasks.failed'))
      load()
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t(`tasks.${kind}.title`)}
        description={open.length ? t('tasks.open', { n: open.length }) : t('tasks.allDone')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <AddRow kind={kind} onAdd={add} />

      {tasks === null ? (
        <Loading />
      ) : (
        <>
          {open.length === 0 && done.length === 0 ? (
            <Card className="mt-4">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <ListChecks className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t(`tasks.${kind}.empty`)}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4 py-0">
              <CardContent className="divide-y px-0">
                {[...open, ...done].map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggle(task)}
                    onRename={(title, dueOn) => rename(task, title, dueOn)}
                    onRemove={() => remove(task)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {done.length > 0 && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearDone}>
                <Trash2 className="size-4" />
                {t('tasks.clear', { n: done.length })}
              </Button>
            </div>
          )}
        </>
      )}

      {/* What supplies already knows is running out. Listed rather than merged
          into the rows above: these are not lines you typed and ticking one
          would mean recording a purchase, which belongs on its own page. */}
      {kind === 'buy' && low.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
            {t('tasks.lowStock')}
          </h2>
          <Card className="overflow-hidden py-0">
            <CardContent className="divide-y px-0">
              {low.map((item) => {
                // Nothing left is a different errand from nearly nothing left,
                // and "sisa 0 liter" is a silly way to say you have none.
                const out = item.quantity <= 0
                return (
                  <Link
                    key={item.id}
                    to={`/supplies/${item.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        out ? 'bg-destructive' : 'bg-warning',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                    <span
                      className={cn(
                        'shrink-0 text-xs',
                        out ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {out
                        ? t('supply.out')
                        : t('tasks.leftOver', {
                            n: item.quantity,
                            unit: tOpt('unit', item.unit),
                          })}
                    </span>
                  </Link>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// One line in, one tap out. The date is the to-do list's only extra field and
// stays out of the way until it is wanted, because most lines never get one.
function AddRow({
  kind,
  onAdd,
}: {
  kind: TaskKind
  onAdd: (title: string, dueOn: string) => Promise<void>
}) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [dating, setDating] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = title.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onAdd(trimmed, dueOn)
      setTitle('')
      setDueOn('')
      setDating(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('tasks.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* A scribble is the one kind worth more than a line, so it gets a
          box that grows. Enter makes a new line there and ctrl-enter files
          it; on the other two lists enter still files, as it always did. */}
      {kind === 'note' ? (
        <Textarea
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit()
          }}
          placeholder={t(`tasks.${kind}.add`)}
          rows={3}
          className="min-w-40 flex-1"
        />
      ) : (
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder={t(`tasks.${kind}.add`)}
          className="min-w-40 flex-1"
        />
      )}
      {kind === 'todo' &&
        (dating ? (
          <Input
            type="date"
            value={dueOn}
            autoFocus
            onChange={(event) => setDueOn(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            className="w-40"
          />
        ) : (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDating(true)}
            aria-label={t('tasks.setDue')}
            title={t('tasks.setDue')}
          >
            <CalendarDays className="size-4" />
          </Button>
        ))}
      <Button onClick={submit} disabled={!title.trim() || busy}>
        <Plus className="size-4" />
        {t('tasks.add')}
      </Button>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onRename,
  onRemove,
}: {
  task: Task
  onToggle: () => void
  onRename: (title: string, dueOn: string) => void
  onRemove: () => void
}) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [dueOn, setDueOn] = useState(task.due_on ?? '')
  const box = useRef<HTMLDivElement>(null)

  const done = task.done_at !== null
  const days = daysUntil(task.due_on)

  function save() {
    setEditing(false)
    onRename(title, dueOn)
  }

  function cancel() {
    setTitle(task.title)
    setDueOn(task.due_on ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        ref={box}
        className="flex flex-wrap items-center gap-2 px-4 py-2"
        // Clicking away is a save, the way an inline edit is expected to
        // behave. Escape is the way out without keeping the change.
        onBlur={(event) => {
          if (!box.current?.contains(event.relatedTarget as Node)) save()
        }}
      >
        {task.kind === 'note' ? (
          <Textarea
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save()
              if (event.key === 'Escape') cancel()
            }}
            rows={4}
            className="min-w-40 flex-1"
          />
        ) : (
          <Input
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
              if (event.key === 'Escape') cancel()
            }}
            className="min-w-40 flex-1"
          />
        )}
        {task.kind === 'todo' && (
          <Input
            type="date"
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
              if (event.key === 'Escape') cancel()
            }}
            className="w-40"
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        task.kind === 'note' ? 'items-start' : 'items-center',
        done && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={t(done ? 'tasks.untick' : 'tasks.tick')}
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded border transition-colors',
          done ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary',
        )}
      >
        {done && <Check className="size-3.5" />}
      </button>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 text-left"
      >
        <span
          className={cn(
            'block text-sm',
            task.kind === 'note' ? 'whitespace-pre-wrap break-words' : 'truncate',
            done && 'line-through',
          )}
        >
          {task.title}
        </span>
      </button>

      {task.due_on && !done && (
        <span
          className={cn(
            'shrink-0 text-xs',
            days !== null && days < 0
              ? 'text-destructive'
              : days !== null && days <= 2
                ? 'text-warning'
                : 'text-muted-foreground',
          )}
        >
          {days === null
            ? formatDate(task.due_on)
            : days < 0
              ? t('cal.late', { n: Math.abs(days) })
              : days === 0
                ? t('cal.today')
                : t('cal.inDays', { n: days })}
        </span>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={t('tasks.delete')}
        title={t('tasks.delete')}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
