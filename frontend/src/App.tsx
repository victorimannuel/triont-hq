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
  CalendarDays,
  FileText,
  FolderGit2,
  House,
  KeyRound,
  Languages,
  Activity,
  Loader2,
  LogOut,
  Menu,
  Search,
  Monitor as MonitorIcon,
  Moon,
  Package,
  Receipt,
  Server,
  Sun,
  ShieldCheck,
  ShoppingBasket,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'

import { api } from '@/api'
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
const Income = lazy(() => import('@/pages/Income'))
const IncomeForm = lazy(() => import('@/pages/IncomeForm'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const ExpenseForm = lazy(() => import('@/pages/ExpenseForm'))
const Trash = lazy(() => import('@/pages/Trash'))
const Supplies = lazy(() => import('@/pages/Supplies'))
const SupplyForm = lazy(() => import('@/pages/SupplyForm'))
const Monitor = lazy(() => import('@/pages/Monitor'))
const Security = lazy(() => import('@/pages/Security'))

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
}

const MetaContext = createContext<Meta>(emptyMeta)
export const useMeta = () => useContext(MetaContext)

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

  useEffect(() => {
    if (session) api.meta().then(setMeta).catch(() => setMeta(emptyMeta))
  }, [session])

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
          <Shell email={session.email} menus={menus} onSignOut={() => setSession(null)} />
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

// Grouped for the sidebar; flattened for the phone's bottom bar. Nine
// destinations is where a row of tabs stops working and a sidebar starts.
const NAV_GROUPS = [
  {
    label: '',
    items: [
      { to: '/', key: 'home', icon: House, end: true },
      { to: '/calendar', key: 'calendar', icon: CalendarDays, end: false },
    ],
  },
  {
    label: 'nav.group.work',
    items: [
      { to: '/projects', key: 'projects', icon: FolderGit2, end: false },
      { to: '/clients', key: 'clients', icon: Users, end: false },
      { to: '/assets', key: 'assets', icon: Server, end: false },
      { to: '/credentials', key: 'credentials', icon: KeyRound, end: false },
      { to: '/income', key: 'income', icon: Wallet, end: false },
      { to: '/expenses', key: 'expenses', icon: Receipt, end: false },
      { to: '/monitor', key: 'monitor', icon: Activity, end: false },
    ],
  },
  {
    label: 'nav.group.personal',
    items: [
      { to: '/documents', key: 'documents', icon: FileText, end: false },
      { to: '/belongings', key: 'belongings', icon: Package, end: false },
      { to: '/supplies', key: 'supplies', icon: ShoppingBasket, end: false },
      { to: '/people', key: 'people', icon: UserRound, end: false },
    ],
  },
]

const NAV = NAV_GROUPS.flatMap((group) => group.items)

// Eleven tabs do not fit a phone, and a bar you have to scroll sideways hides
// half of itself. Three live in the bar, search takes the middle, and the rest
// are one tap away in a drawer. Search earns the centre because it is the only
// one that does something rather than going somewhere — and it reaches every
// module anyway, which is why credentials no longer needs a tab of its own.
const PRIMARY = ['home', 'calendar', 'projects']
const TABS_LEFT = NAV.filter((item) => item.key === 'home' || item.key === 'calendar')
const TABS_RIGHT = NAV.filter((item) => item.key === 'projects')

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
        <Link
          to="/"
          className="flex h-14 items-center gap-2 border-b px-4 font-semibold tracking-tight"
        >
          <Logo className="size-7 text-primary" />
          HQ
        </Link>

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
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label || index} className={index > 0 ? 'mt-5' : ''}>
              {group.label && (
                <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.label)}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
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
                  {t(`nav.${item.key}`)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

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
            {menus}
            {userMenu}
          </div>
        </div>
      </header>

      {/* pb leaves room for the bottom tab bar plus the phone's home indicator. */}
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-8 md:pb-16 md:pl-56">
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
              <Route path="/belongings" element={<Belongings />} />
              <Route path="/belongings/new" element={<BelongingForm />} />
              <Route path="/belongings/:id" element={<BelongingForm />} />
              <Route path="/people" element={<People />} />
              <Route path="/people/new" element={<PersonForm />} />
              <Route path="/people/:id" element={<PersonForm />} />
              <Route path="/income" element={<Income />} />
              <Route path="/income/new" element={<IncomeForm />} />
              <Route path="/income/:id" element={<IncomeForm />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/expenses/new" element={<ExpenseForm />} />
              <Route path="/expenses/:id" element={<ExpenseForm />} />
              <Route path="/supplies" element={<Supplies />} />
            <Route path="/supplies/new" element={<SupplyForm />} />
            <Route path="/supplies/:id" element={<SupplyForm />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/security" element={<Security />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      <SearchPalette open={finder} onOpenChange={setFinder} />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex items-end">
          {TABS_LEFT.map((item) => (
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

          {/* Lifted out of the bar so the thumb's easiest reach goes to the one
              control that gets you anywhere at all. It keeps a label like every
              other tab: without one it reads as a stray blob rather than part
              of the bar. */}
          <button
            type="button"
            onClick={() => setFinder(true)}
            className="-mt-6 flex flex-1 flex-col items-center gap-1 px-1 pb-2.5 transition-transform active:scale-95"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Search className="size-6" />
            </span>
            <span className="w-full truncate text-center text-[10px] font-medium text-muted-foreground">
              {t('search.tab')}
            </span>
          </button>

          {TABS_RIGHT.map((item) => (
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
                <Menu className="size-5" />
                <span className="w-full truncate text-center">{t('nav.more')}</span>
              </button>
            </SheetTrigger>

            <SheetContent side="right" className="p-0">
              <SheetTitle className="border-b px-4 py-4">{t('nav.more')}</SheetTitle>
              <nav className="flex-1 overflow-y-auto p-3">
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
                          {t(`nav.${item.key}`)}
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
