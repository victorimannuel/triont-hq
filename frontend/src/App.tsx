import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  Bell,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  LogOut,
  Menu,
  Search,
  Monitor as MonitorIcon,
  Moon,
  Sun,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import { api } from '@/api'
import {
  applyDisguise,
  disguisedAll,
  disguisedAt,
  setDisguisedAll,
  useDisguise,
} from '@/lib/disguise'
import { applyTheme, readTheme, THEMES, type Theme } from '@/theme'
import {
  I18nContext,
  LANG_LABELS,
  LANGS,
  makeTranslate,
  persistLang,
  readLang,
  useT,
  type Lang,
} from '@/i18n'
import type { Meta } from '@/types'
import { Button } from '@/components/ui/button'
import { SearchPalette, useSearchHotkey } from '@/components/Search'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmProvider } from '@/components/confirm'
import { Logo } from '@/components/Logo'
import { TimerPill } from '@/components/TimerPill'
import { WorkPill } from '@/components/WorkPill'
import { notifyAlarm, playAlarm } from '@/lib/alarm'
import { refreshUnread, useUnread } from '@/lib/notices'
import { refreshRunning } from '@/lib/running'
import { syncFavs, useFavs } from '@/lib/favnav'
import { NAV, NAV_GROUPS, PRIMARY, TABS, type NavItem } from '@/nav'
import { clock, setRingHandler, useTimerAlarm } from '@/lib/timer'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

import Login from '@/pages/Login'
import Overview from '@/pages/Overview'
import Enrol from '@/pages/Enrol'

// Every page below is fetched the first time it is opened. The whole app in
// one file meant paying for the belongings form to read the home page.
const Projects = lazy(() => import('@/pages/Projects'))
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'))
const ProjectForm = lazy(() => import('@/pages/ProjectForm'))
const Credentials = lazy(() => import('@/pages/Credentials'))
const CredentialForm = lazy(() => import('@/pages/CredentialForm'))
const Assets = lazy(() => import('@/pages/Assets'))
const AssetForm = lazy(() => import('@/pages/AssetForm'))
const Clients = lazy(() => import('@/pages/Clients'))
const ClientForm = lazy(() => import('@/pages/ClientForm'))
const Documents = lazy(() => import('@/pages/Documents'))
const DocumentForm = lazy(() => import('@/pages/DocumentForm'))
const Belongings = lazy(() => import('@/pages/Belongings'))
const BelongingForm = lazy(() => import('@/pages/BelongingForm'))
const People = lazy(() => import('@/pages/People'))
const PersonForm = lazy(() => import('@/pages/PersonForm'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const CalendarEventForm = lazy(() => import('@/pages/CalendarEventForm'))
const Income = lazy(() => import('@/pages/Income'))
const IncomeForm = lazy(() => import('@/pages/IncomeForm'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Budget = lazy(() => import('@/pages/Budget'))
const ExpenseForm = lazy(() => import('@/pages/ExpenseForm'))
const Tracker = lazy(() => import('@/pages/Tracker'))
const TrackerForm = lazy(() => import('@/pages/TrackerForm'))
const TrackerCompanies = lazy(() => import('@/pages/TrackerCompanies'))
const Partner = lazy(() => import('@/pages/Partner'))
const Trash = lazy(() => import('@/pages/Trash'))
const Notices = lazy(() => import('@/pages/Notices'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Songs = lazy(() => import('@/pages/Songs'))
const SongSheet = lazy(() => import('@/pages/SongSheet'))
const Tuner = lazy(() => import('@/pages/Tuner'))
const SongForm = lazy(() => import('@/pages/SongForm'))
const Journal = lazy(() => import('@/pages/Journal'))
const Habits = lazy(() => import('@/pages/Habits'))
const HabitCheckin = lazy(() => import('@/pages/HabitCheckin'))
const HabitForm = lazy(() => import('@/pages/HabitForm'))
const Setlists = lazy(() => import('@/pages/Setlists'))
const SetlistPlay = lazy(() => import('@/pages/SetlistPlay'))
const Work = lazy(() => import('@/pages/Work'))
const WorkMonth = lazy(() => import('@/pages/WorkMonth'))
const Meals = lazy(() => import('@/pages/Meals'))
const MealForm = lazy(() => import('@/pages/MealForm'))
const Foods = lazy(() => import('@/pages/Foods'))
const Supplies = lazy(() => import('@/pages/Supplies'))
const SupplyForm = lazy(() => import('@/pages/SupplyForm'))
const Monitor = lazy(() => import('@/pages/Monitor'))
const Security = lazy(() => import('@/pages/Security'))
const Timer = lazy(() => import('@/pages/Timer'))

const emptyMeta: Meta = {
  statuses: [],
  kinds: [],
  link_categories: [],
  credential_kinds: [],
  asset_kinds: [],
  asset_statuses: [],
  billing_cycles: [],
  currencies: [],
  client_statuses: [],
  client_kinds: [],
  ownerships: [],
  conditions: [],
  income_statuses: [],
  expense_categories: [],
  document_kinds: [],
  belonging_kinds: [],
  belonging_statuses: [],
  maintenance_kinds: [],
  supply_categories: [],
  supply_units: [],
  meal_kinds: [],
  song_parts: [],
  budget_buckets: [],
  tracker_priorities: [],
  tracker_projects: [],
  tracker_owners: [],
  tracker_statuses: [],
  tracker_companies: [],
}

const MetaContext = createContext<Meta>(emptyMeta)
export const useMeta = () => useContext(MetaContext)

// Meta is fetched once at sign-in, but some of it is now editable — the tracker's
// companies live in a table. A page that changes such a list calls this to pull a
// fresh copy, so its dropdowns and pills update without a full reload.
const MetaRefreshContext = createContext<() => void>(() => {})
export const useRefreshMeta = () => useContext(MetaRefreshContext)

const THEME_ICONS = { system: MonitorIcon, light: Sun, dark: Moon } as const

type Session = { email: string } | null

export default function App() {
  const [session, setSession] = useState<Session>(null)
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [checking, setChecking] = useState(true)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [lang, setLang] = useState<Lang>(readLang)

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => persistLang(lang), [lang])

  const i18n = useMemo(() => makeTranslate(lang), [lang])

  useEffect(() => {
    api
      .me()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setChecking(false))
  }, [])

  const refreshMeta = useCallback(() => {
    api.meta().then(setMeta).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (session) {
      api.meta().then(setMeta).catch(() => setMeta(emptyMeta))
      // Pull the account's starred pages down, so the same favourites show up
      // here as on any other device the moment you sign in.
      void syncFavs()
    }
  }, [session])

  // The alarm belongs to the app rather than to the timer page: a countdown
  // has to go off while you are somewhere else, which is the whole point.
  useTimerAlarm()
  useEffect(() => {
    setRingHandler((done) => {
      playAlarm()
      if (done.mode === 'work') notifyAlarm(i18n.t('timer.break'), i18n.t('timer.toBreak'))
      else if (done.mode === 'break') notifyAlarm(i18n.t('timer.work'), i18n.t('timer.toWork'))
      else
        notifyAlarm(
          done.label || i18n.t('timer.done'),
          i18n.t('timer.notifBody', { duration: clock(done.duration) }),
        )
    })
  }, [i18n])

  const menus = (
    <>
      <LangMenu lang={lang} onPick={setLang} />
      <ThemeMenu theme={theme} onPick={setTheme} />
    </>
  )
  // Top right: the bottom of the screen belongs to the tab bar on phones and
  // to the unsaved-changes bar on the editable pages.
  const toaster = <Toaster theme={theme} position="top-right" mobileOffset={{ top: '4.5rem' }} />

  // The enrolment link lands on a device with no session at all, so it has to
  // render before the sign-in gate rather than behind it.
  if (window.location.pathname === '/enrol') {
    return (
      <I18nContext.Provider value={i18n}>
        <Enrol menus={menus} />
        {toaster}
      </I18nContext.Provider>
    )
  }

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <I18nContext.Provider value={i18n}>
      <ConfirmProvider>
      {session ? (
        <MetaContext.Provider value={meta}>
          <MetaRefreshContext.Provider value={refreshMeta}>
            <Shell email={session.email} menus={menus} onSignOut={() => setSession(null)} />
          </MetaRefreshContext.Provider>
        </MetaContext.Provider>
      ) : (
        <Login onDone={setSession} menus={menus} />
      )}
      {toaster}
      </ConfirmProvider>
    </I18nContext.Provider>
  )
}

// Shown while a page chunk loads. Deliberately quiet: on a warm cache it is
// never seen, and on a cold one a spinner beats a blank panel.
function PageLoading() {
  return (
    <div className="flex justify-center py-20 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}

function ThemeMenu({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) {
  const { t } = useT()
  const Icon = THEME_ICONS[theme]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.theme')}>
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('nav.theme')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((value) => {
          const ItemIcon = THEME_ICONS[value]
          return (
            <DropdownMenuItem key={value} onClick={() => onPick(value)}>
              <ItemIcon className="size-4" />
              {t(`theme.${value}`)}
              {theme === value && <span className="ml-auto text-xs text-muted-foreground">•</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LangMenu({ lang, onPick }: { lang: Lang; onPick: (l: Lang) => void }) {
  const { t } = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.language')}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('nav.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGS.map((value) => (
          <DropdownMenuItem key={value} onClick={() => onPick(value)}>
            {LANG_LABELS[value]}
            {lang === value && <span className="ml-auto text-xs text-muted-foreground">•</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// One row in the desktop sidebar. Favouriting lives in the page header now, so
// the row is just the link; the same component draws the Favourites list up top
// and the full groups below it.
function SidebarLink({ item, unread }: { item: NavItem; unread: number }) {
  const { t } = useT()
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
      {item.key === 'notices' && unread > 0 && <Badge>{unread}</Badge>}
    </NavLink>
  )
}

// The bell, in the corner of whichever header is showing. It carries the
// number rather than a dot: "3 waiting" is worth opening for and "something
// is waiting" is not.
function BellLink({ unread }: { unread: number }) {
  const { t } = useT()
  return (
    <Button variant="ghost" size="icon" asChild aria-label={t('nav.notices')}>
      <Link to="/notices" className="relative">
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}

function Shell({
  email,
  menus,
  onSignOut,
}: {
  email: string
  menus: React.ReactNode
  onSignOut: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useT()
  const [drawer, setDrawer] = useState(false)
  const [finder, setFinder] = useState(false)
  // Shared with the page header, where the star lives: toggling it there lights
  // up the Favourites list here in the same frame.
  const favs = useFavs()
  const unread = useUnread()
  useDisguise()

  // The starred destinations, resolved to nav items in the order they were
  // starred; a key left over from a renamed page simply drops out.
  const favItems = favs
    .map((key) => NAV.find((item) => item.key === key))
    .filter((item): item is NavItem => Boolean(item))

  const hidden = disguisedAt(location.pathname)

  // Re-counted on every page change rather than on a timer: the badge only has
  // to be right when you are looking at it, and you are looking at it whenever
  // a page has just arrived.
  useEffect(() => {
    void refreshUnread()
    // Same reasoning for the clocks: the pill counts up on its own from the
    // start time, so it only has to be told what is running when you move.
    void refreshRunning()
  }, [location.pathname])

  // The frosting on attachments is a stylesheet rule hanging off the root, and
  // with a switch per page it has to follow the route as well as the switches.
  useEffect(() => {
    applyDisguise(location.pathname)
  }, [location.pathname, hidden])
  useSearchHotkey(useCallback(() => setFinder(true), []))

  // The drawer tab lights up when the page you are on lives inside it.
  const restActive = NAV.some(
    (item) => !PRIMARY.includes(item.key) && location.pathname.startsWith(item.to),
  )

  // A tap on a link inside the drawer navigates; the drawer should not still be
  // sitting there when the new page arrives.
  useEffect(() => setDrawer(false), [location.pathname])

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined)
    onSignOut()
    navigate('/')
  }, [navigate, onSignOut])

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-full justify-start truncate font-normal">
          {email}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/security">
            <ShieldCheck className="size-4" />
            {t('nav.security')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/trash">
            <Trash2 className="size-4" />
            {t('nav.trash')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* The whole app at once; the switch beside each heading does one page.
            A reload rather than a state flip: every page is already holding the
            answers it fetched before the switch, and those do not go through
            the censor a second time. */}
        <DropdownMenuItem
          onClick={() => {
            setDisguisedAll(!disguisedAll())
            window.location.reload()
          }}
        >
          {disguisedAll() ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {disguisedAll() ? t('disguise.off') : t('disguise.on')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} variant="destructive">
          <LogOut className="size-4" />
          {t('nav.signout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="min-h-svh">
      {/* Sidebar from md up; below that the header and bottom bar take over. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-7 text-primary" />
            HQ
          </Link>
          {/* Up here as well as in the list below: the corner by the logo is
              where the eye lands first, so a number waiting there is seen
              before any scrolling — same spot the phone header uses. */}
          <BellLink unread={unread} />
        </div>

        <button
          type="button"
          onClick={() => setFinder(true)}
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{t('search.open')}</span>
          <kbd className="rounded border px-1 text-[10px] leading-4">/</kbd>
        </button>

        <nav className="flex-1 overflow-y-auto p-3">
          {/* The starred pages, up top. Only when there is at least one — an
              empty heading is just noise. The star that fills this lives in the
              page header now, next to the eye. */}
          {favItems.length > 0 && (
            <div className="mb-5">
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('nav.group.favorites')}
              </div>
              {favItems.map((item) => (
                <SidebarLink key={item.to} item={item} unread={unread} />
              ))}
            </div>
          )}
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label || index} className={index > 0 ? 'mt-5' : ''}>
              {group.label && (
                <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.label)}
                </div>
              )}
              {group.items.map((item) => (
                <SidebarLink key={item.to} item={item} unread={unread} />
              ))}
            </div>
          ))}
        </nav>

        <TimerPill className="mx-3 mt-3 justify-center" />

        <div className="flex items-center gap-1 border-t p-3">
          <div className="min-w-0 flex-1">{userMenu}</div>
          {menus}
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
        <div className="flex h-14 items-center gap-1 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-7 text-primary" />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <TimerPill />
            {/* Where a magnifier is looked for. It used to be the raised
                button in the bottom bar; that spot now goes to a place you
                actually visit, and this is the more findable home anyway. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFinder(true)}
              aria-label={t('search.open')}
            >
              <Search className="size-4" />
            </Button>
            {/* Beside the magnifier, because both are things you do now —
                language, theme and the account are settings you touch once.
                The bell before the account is also where every other app puts
                it, so it costs nobody a moment's looking. */}
            <BellLink unread={unread} />
            {menus}
            {userMenu}
          </div>
        </div>
      </header>

      {/* pb leaves room for the bottom tab bar plus the phone's home indicator.
          Shorter than it was: the bar used to have a button standing proud of
          it, and the extra room that needed is now just a gap. */}
      <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-8 md:pb-16 md:pl-56">
        <div className="mx-auto max-w-5xl px-4 md:px-8">
          {/* One boundary for every route: the spinner shows only while a page
              chunk is in flight, which is the first visit and never again. */}
          <Suspense fallback={<PageLoading />}>
              <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/new" element={<ProjectForm />} />
              {/* No separate edit route: the project page is editable in place. */}
              <Route path="/projects/:slug" element={<ProjectDetail />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/new" element={<ClientForm />} />
              <Route path="/clients/:slug" element={<ClientForm />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/assets/new" element={<AssetForm />} />
              <Route path="/assets/:id" element={<AssetForm />} />
              <Route path="/credentials" element={<Credentials />} />
              <Route path="/credentials/new" element={<CredentialForm />} />
              <Route path="/credentials/:id" element={<CredentialForm />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/documents/new" element={<DocumentForm />} />
              <Route path="/documents/:id" element={<DocumentForm />} />
              <Route path="/calendar" element={<Calendar />} />
              {/* Literal 'new' beats the :id below, so it cannot be read as an id. */}
              <Route path="/calendar/new" element={<CalendarEventForm />} />
              <Route path="/calendar/:id" element={<CalendarEventForm />} />
              <Route path="/belongings" element={<Belongings />} />
              <Route path="/belongings/new" element={<BelongingForm />} />
              <Route path="/belongings/:id" element={<BelongingForm />} />
              <Route path="/people" element={<People />} />
              <Route path="/people/new" element={<PersonForm />} />
              <Route path="/people/:id" element={<PersonForm />} />
              <Route path="/income" element={<Income />} />
              <Route path="/income/new" element={<IncomeForm />} />
              <Route path="/income/:id" element={<IncomeForm />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/expenses/new" element={<ExpenseForm />} />
              <Route path="/expenses/:id" element={<ExpenseForm />} />
              <Route path="/tracker" element={<Tracker />} />
              <Route path="/tracker/new" element={<TrackerForm />} />
              {/* A literal segment, so it beats :id and cannot be read as a task. */}
              <Route path="/tracker/companies" element={<TrackerCompanies />} />
              <Route path="/tracker/:id" element={<TrackerForm />} />
              <Route path="/pasangan" element={<Partner />} />
              <Route path="/supplies" element={<Supplies />} />
            <Route path="/supplies/new" element={<SupplyForm />} />
            <Route path="/supplies/:id" element={<SupplyForm />} />
            {/* One page, two lists. The key remounts it on the way across, so
                the other list never flashes up under this one's heading. */}
            <Route path="/journal" element={<Journal />} />
            <Route path="/waktu" element={<Work />} />
            {/* The month sits under the log because it reads from it. */}
            <Route path="/waktu/bulan" element={<WorkMonth />} />
            <Route path="/makan" element={<Meals />} />
            {/* The food table sits under the log because it exists for it. */}
            <Route path="/makan/daftar" element={<Foods />} />
            <Route path="/makan/:id" element={<MealForm />} />
            <Route path="/habits" element={<Habits />} />
            {/* Where the evening notification lands. A literal segment, so
                it beats :id and cannot be read as a habit. */}
            <Route path="/habits/checkin" element={<HabitCheckin />} />
            <Route path="/habits/:id" element={<HabitForm />} />
            <Route path="/setlists" element={<Setlists />} />
            <Route path="/setlists/:id" element={<SetlistPlay />} />
            <Route path="/songs" element={<Songs />} />
            <Route path="/songs/new" element={<SongForm />} />
            {/* The chart is what gets opened; editing it is the rarer trip, so
                it is the one that takes the longer path. */}
            <Route path="/songs/:id" element={<SongSheet />} />
            <Route path="/tuner" element={<Tuner />} />
            <Route path="/songs/:id/edit" element={<SongForm />} />
            <Route path="/notes" element={<Tasks key="note" kind="note" />} />
          <Route path="/todo" element={<Tasks key="todo" kind="todo" />} />
            <Route path="/shopping" element={<Tasks key="buy" kind="buy" />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/security" element={<Security />} />
            <Route path="/timer" element={<Timer />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      <SearchPalette open={finder} onOpenChange={setFinder} />

      {/* Floats over everything for as long as a clock is going, and is not
          there at all otherwise. */}
      <WorkPill />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {/* Five equal tabs. Nothing is raised any more: the lifted shape said
            "this one is an action, not a place", and every one of these is a
            place. */}
        <div className="flex items-end">
          {TABS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <item.icon className="size-5" />
              <span className="w-full truncate text-center">{t(`nav.${item.key}`)}</span>
            </NavLink>
          ))}

          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors',
                  restActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <Menu className="size-5" />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-primary" />
                  )}
                </span>
                <span className="w-full truncate text-center">{t('nav.more')}</span>
              </button>
            </SheetTrigger>

            <SheetContent side="right" className="p-0">
              <SheetTitle className="border-b px-4 py-4">{t('nav.more')}</SheetTitle>
              <nav className="flex-1 overflow-y-auto p-3">
                {/* Starred pages first, the same as the desktop sidebar, so a
                    favourite is one tap away from the phone too. */}
                {favItems.length > 0 && (
                  <div className="mb-5">
                    <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('nav.group.favorites')}
                    </div>
                    {favItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setDrawer(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-secondary text-secondary-foreground'
                              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                          )
                        }
                      >
                        <item.icon className="size-4" />
                        <span className="flex-1">{t(`nav.${item.key}`)}</span>
                        {item.key === 'notices' && unread > 0 && <Badge>{unread}</Badge>}
                      </NavLink>
                    ))}
                  </div>
                )}
                {NAV_GROUPS.map((group, index) => {
                  const items = group.items.filter((item) => !PRIMARY.includes(item.key))
                  if (!items.length) return null
                  return (
                    <div key={group.label || index} className={index > 0 ? 'mt-5' : ''}>
                      {group.label && (
                        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(group.label)}
                        </div>
                      )}
                      {items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          onClick={() => setDrawer(false)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-secondary text-secondary-foreground'
                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                            )
                          }
                        >
                          <item.icon className="size-4" />
                          <span className="flex-1">{t(`nav.${item.key}`)}</span>
                          {item.key === 'notices' && unread > 0 && <Badge>{unread}</Badge>}
                        </NavLink>
                      ))}
                    </div>
                  )
                })}

                <div className="mt-5 border-t pt-3">
                  <Link
                    to="/security"
                    onClick={() => setDrawer(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <ShieldCheck className="size-4" />
                    {t('nav.security')}
                  </Link>
                  <Link
                    to="/trash"
                    onClick={() => setDrawer(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Trash2 className="size-4" />
                    {t('nav.trash')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawer(false)
                      void signOut()
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    {t('nav.signout')}
                  </button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}
