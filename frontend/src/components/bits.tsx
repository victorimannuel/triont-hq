import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Eye, EyeOff, Loader2, Minus, Plus } from 'lucide-react'

import {
  disguisedAll,
  disguisedAt,
  disguisedPage,
  pageKey,
  setDisguisedAll,
  setDisguisedPage,
  useDisguise,
} from '@/lib/disguise'
import { currentLocale, useT } from '@/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Two or three mutually exclusive choices, small enough to sit beside a
 *  heading. Labels are given, not translated: "30d" reads the same either way. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex shrink-0 rounded-md border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium transition-colors',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  /** Where the arrow beside the title goes. A path rather than history, so it
   *  lands somewhere sensible even when the page was opened from a link. */
  back?: string
}) {
  const { t } = useT()
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-1.5">
        {back && (
          <Button asChild variant="ghost" size="icon" className="-ml-2 mt-0.5 shrink-0">
            <Link to={back} aria-label={t('common.back')}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold lowercase tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <CoverToggle />
      </div>
      {action}
    </div>
  )
}

/*
The switch for one page, sitting where you can see which page it belongs to.
Every page draws its heading through PageHeader, so putting it here is what
gets it onto all of them at once.

A reload rather than a state flip: the page is already holding the answers it
fetched before the switch, and those do not pass through the censor a second
time.
*/
function CoverToggle() {
  const { t } = useT()
  const location = useLocation()
  useDisguise()

  const key = pageKey(location.pathname)
  const covered = disguisedAll() || disguisedPage(key)

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      // Faint until it is doing something: it is on every page in the app, and
      // it is not what any of them is for.
      className={cn('mt-0.5 shrink-0', !covered && 'text-muted-foreground/40')}
      aria-label={covered ? t('disguise.showAll') : t('disguise.pageOn')}
      onClick={() => {
        // Covering is per page, but uncovering is not: whatever is hiding this
        // screen — the page's own mark or the switch in the user menu — one
        // press of the visible button puts everything back. Two switches that
        // can each veto the other is how you end up pressing a button that
        // looks like it should work and does nothing.
        if (covered) setDisguisedAll(false)
        else setDisguisedPage(key, true)
        window.location.reload()
      }}
    >
      {covered ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </Button>
  )
}

/*
A square of colour standing in for a name, so a list is something the eye can
tell apart before it starts reading — which is most of what a column of plain
rows was missing. The colour is the name's own, so it stays put when the list
reorders, and red is left out on purpose: red already means broken everywhere
else in here.

Decorative, and hidden from screen readers, because the name it stands for is
always sitting right beside it.
*/
const MARKS = [
  'bg-primary/15 text-primary',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-foreground/[0.08] text-foreground/70',
]

export function Mark({ name, className }: { name: string; className?: string }) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold uppercase',
        MARKS[hash % MARKS.length],
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
}

// Status carries meaning, so it gets colour; everything else stays neutral so
// the table does not turn into a rainbow.
const STATUS_CLASS: Record<string, string> = {
  active: 'border-transparent bg-success/15 text-success',
  paused: 'border-transparent bg-warning/15 text-warning',
  done: 'border-transparent bg-primary/15 text-primary',
  archived: 'text-muted-foreground',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_CLASS[status])}>
      {label}
    </Badge>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}

export function Loading() {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Spinner /> {t('common.loading')}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {children}
    </div>
  )
}

// Built on demand and kept, because constructing an Intl formatter is the
// expensive part and these are called once per table row. The language toggle
// picks a different bucket rather than rebuilding the old one.
const stamps = new Map<string, Intl.DateTimeFormat>()
const days = new Map<string, Intl.DateTimeFormat>()

function formatter(cache: Map<string, Intl.DateTimeFormat>, options: Intl.DateTimeFormatOptions) {
  const locale = currentLocale()
  let found = cache.get(locale)
  if (!found) {
    found = new Intl.DateTimeFormat(locale, options)
    cache.set(locale, found)
  }
  return found
}

function when(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatter(stamps, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatter(days, { dateStyle: 'medium' }).format(date)
}

// An amount that carries decimals shows them, whatever the currency; a round
// rupiah figure still prints as "Rp 750.000" rather than "Rp 750.000,00".
//
// This is also where screenshot mode covers an amount. Every digit becomes a
// bullet and the symbol and separators stay, so the figure is unreadable but
// still shaped like money and still the width the column was built for.
export function formatMoney(amount: number, currency: string) {
  if (!amount) return '—'
  const covered = disguisedAt(window.location.pathname)
  try {
    const format = new Intl.NumberFormat(currentLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) && currency === 'IDR' ? 0 : 2,
      maximumFractionDigits: 2,
    })
    if (!covered) return format.format(amount)
    // Symbol and spacing kept, the figure itself gone in one run rather than
    // digit for digit: a bullet per digit still said whether he earns hundreds
    // of thousands or tens of millions.
    let put = false
    return format
      .formatToParts(amount)
      .map((part) => {
        if (part.type === 'currency' || part.type === 'literal') return part.value
        if (put) return ''
        put = true
        return '••••'
      })
      .join('')
  } catch {
    return `${currency} ${covered ? '••••' : amount}`
  }
}

// A plain whole number with the reader's own grouping. Five figures of days
// lived are unreadable without the separators.
export function formatCount(n: number) {
  return new Intl.NumberFormat(currentLocale()).format(n)
}

// Whole days from today, negative once the date has passed.
export function daysUntil(value?: string | null) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

export function RenewalBadge({ renewsOn }: { renewsOn?: string | null }) {
  const { t } = useT()
  const days = daysUntil(renewsOn)
  if (days === null) return <span className="text-muted-foreground">—</span>

  const tone =
    days < 0
      ? 'border-transparent bg-destructive/15 text-destructive'
      : days <= 30
        ? 'border-transparent bg-warning/15 text-warning'
        : 'text-muted-foreground'

  const text =
    days < 0
      ? t('cal.late', { n: Math.abs(days) })
      : days === 0
        ? t('cal.today')
        : t('cal.inDays', { n: days })

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-sm">{formatDate(renewsOn)}</span>
      <Badge variant="outline" className={cn('w-fit text-[11px] font-medium', tone)}>
        {text}
      </Badge>
    </span>
  )
}

// Shown at the bottom of a record. Empty "by" values come from rows written
// before the audit columns existed, so they read as "—" rather than blank.
export function AuditInfo({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
}: {
  createdBy?: string
  createdAt?: string
  updatedBy?: string
  updatedAt?: string
}) {
  const { t } = useT()
  return (
    <dl className="mt-6 grid gap-x-8 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2">
      <div className="flex gap-2">
        <dt className="shrink-0">{t('common.created')}</dt>
        <dd className="text-foreground/70">
          {when(createdAt)}
          {createdBy ? ` · ${createdBy}` : ''}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0">{t('common.updated')}</dt>
        <dd className="text-foreground/70">
          {when(updatedAt)}
          {updatedBy ? ` · ${updatedBy}` : ''}
        </dd>
      </div>
    </dl>
  )
}

/**
 * A form with its attachments beside it instead of underneath. On a wide
 * screen the two sit side by side; below that they stack, which is where they
 * were before.
 *
 * A record that does not exist yet has nothing to attach, so there is no side
 * and no grid — the page keeps its old single-column width rather than leaving
 * the form stranded in the corner of an empty one.
 */
export function FormLayout({ side, children }: { side?: ReactNode; children: ReactNode }) {
  if (!side) return <>{children}</>
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div>{children}</div>
      {/* Wrapped, because a fragment would spill its own children into
          separate grid cells and drop half of them back under the form. */}
      <div>{side}</div>
    </div>
  )
}

/**
 * The rest of a form, folded away. Most records here are saved with two or
 * three fields filled in, so laying eighteen of them out at once makes a
 * five-second job look like something to be put off until later.
 *
 * The note says how much is already in there, because a fold that hides the
 * fact that something has been filled in is worse than no fold at all.
 */
export function MoreFields({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-dashed">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium lowercase text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        {label}
        {note && !open && <span className="ml-auto text-xs font-normal">{note}</span>}
      </button>
      {/* Unmounted rather than hidden: the values live in the page's own state,
          so nothing is lost, and a field nobody can see cannot block a save. */}
      {open && <div className="space-y-5 border-t px-4 py-5">{children}</div>}
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium lowercase leading-none">
        {label} {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * A money field that lets a decimal point survive being typed. A plain
 * controlled number input cannot: "1500." parses back to 1500, the value prop
 * rewrites the box, and the dot disappears before the cents can be typed. This
 * one holds the raw text and only reports the parsed number upwards.
 */
export function MoneyInput({
  value,
  onValue,
  className,
  ...rest
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValue: (amount: number) => void
}) {
  const [text, setText] = useState(value ? String(value) : '')

  // Only resync when the outside disagrees with what is typed — loading a
  // record, or a reset. Otherwise every keystroke would fight the box.
  useEffect(() => {
    setText((current) => (Number(current || '0') === value ? current : value ? String(value) : ''))
  }, [value])

  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      className={cn('tabular-nums', className)}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onValue(event.target.value === '' ? 0 : Number(event.target.value))
      }}
      {...rest}
    />
  )
}

/**
 * How many, asked with the thumb. A bare number field means the keyboard for
 * an answer that is almost always one or two, so the buttons carry the common
 * case and typing stays there for the night it was fourteen.
 *
 * Minus stops at one. None of something is a different answer, and the places
 * this is used have their own, plainer way of saying it.
 *
 * The value is text rather than a number so a half-typed box can be empty:
 * "0" appearing the moment the field is cleared is the sort of thing that
 * makes a field feel like it is arguing.
 */
export function Stepper({
  value,
  onValue,
  label,
  caption,
  disabled,
  big,
  onEnter,
}: {
  value: string
  onValue: (value: string) => void
  /** Names the field for a screen reader; not drawn. */
  label?: string
  /** The line under the box, usually the unit. */
  caption?: string
  disabled?: boolean
  /** Thumb-sized, for a page that is nothing but this question. */
  big?: boolean
  onEnter?: () => void
}) {
  const bump = (delta: number) => onValue(String(Math.max(0, (Number(value) || 0) + delta)))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('shrink-0', big ? 'size-12' : 'size-10')}
          disabled={disabled || (Number(value) || 0) <= 1}
          onClick={() => bump(-1)}
          aria-label="−1"
        >
          <Minus className={big ? 'size-5' : 'size-4'} />
        </Button>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          onKeyDown={(event) => {
            if (!onEnter || event.key !== 'Enter') return
            event.preventDefault()
            onEnter()
          }}
          className={cn(
            'text-center font-semibold tabular-nums',
            big ? 'h-16 w-28 text-2xl' : 'h-12 w-24 text-lg',
          )}
          aria-label={label}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('shrink-0', big ? 'size-12' : 'size-10')}
          disabled={disabled}
          onClick={() => bump(1)}
          aria-label="+1"
        >
          <Plus className={big ? 'size-5' : 'size-4'} />
        </Button>
      </div>
      {caption && <p className="text-center text-sm text-muted-foreground">{caption}</p>}
    </div>
  )
}

/**
 * A name field with one button that flips the whole value between Title Case
 * and all lowercase. Names arrive from a phone keyboard, from a paste and from
 * autocapitalise, so a list ends up with "Tisu Basah" next to "tisu basah"
 * unless settling it costs one tap.
 *
 * The button shows what it is about to do, and only ever acts on demand:
 * typing is never rewritten under the cursor, which would fight anyone
 * entering a name that is deliberately odd.
 */
export function NameInput({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onValue: (value: string) => void
}) {
  const { t } = useT()

  // Already all lowercase means the next tap should capitalise; anything else
  // gets flattened. One button, and its label says which way it goes.
  const willCapitalise = value === value.toLocaleLowerCase()

  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(event) => onValue(event.target.value)} {...rest} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        title={willCapitalise ? t('common.titleCase') : t('common.lowerCase')}
        aria-label={willCapitalise ? t('common.titleCase') : t('common.lowerCase')}
        onClick={() =>
          onValue(willCapitalise ? titleCase(value) : value.toLocaleLowerCase())
        }
      >
        <span className="text-xs font-semibold">{willCapitalise ? 'Aa' : 'aa'}</span>
      </Button>
    </div>
  )
}

// Every word gets a capital and the rest goes lower, which is what "capitalise"
// means to everyone who is not a typographer. Anything after a space, hyphen,
// slash or bracket starts a new word, so "e-commerce" and "tisu/napkin" behave.
function titleCase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (_, before: string, letter: string) =>
      before + letter.toLocaleUpperCase(),
    )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <h2 className="mt-10 mb-3 text-lg font-semibold lowercase tracking-tight">
      {children}
      {hint && <span className="ml-2 text-sm font-normal text-muted-foreground">{hint}</span>}
    </h2>
  )
}
