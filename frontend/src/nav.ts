import {
  Activity,
  Bell,
  Calendar as CalendarIcon,
  ClipboardList,
  Clock,
  FileText,
  FolderGit2,
  Gift,
  House,
  KeyRound,
  ListMusic,
  ListTodo,
  Music,
  NotebookPen,
  Package,
  PenLine,
  PiggyBank,
  Receipt,
  Repeat2,
  Server,
  ShoppingBasket,
  ShoppingCart,
  Timer as TimerIcon,
  UserRound,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'

/*
The one description of where the app can go, shared rather than owned by the
shell: the sidebar draws it grouped, the phone's bottom bar draws four of it, and
the favourites shortcuts in the header resolve their keys against it. Keeping it
here is what lets the header read it without reaching back into App and tangling
the two into a cycle.

Nine destinations is where a row of tabs stops working and a sidebar starts.
*/
export const NAV_GROUPS = [
  {
    label: 'nav.group.daily',
    items: [
      { to: '/', key: 'home', icon: House, end: true },
      { to: '/notes', key: 'notes', icon: PenLine, end: false },
      { to: '/todo', key: 'todo', icon: ListTodo, end: false },
      { to: '/habits', key: 'habits', icon: Repeat2, end: false },
      { to: '/journal', key: 'journal', icon: NotebookPen, end: false },
      { to: '/calendar', key: 'calendar', icon: CalendarIcon, end: false },
      { to: '/notices', key: 'notices', icon: Bell, end: false },
      { to: '/timer', key: 'timer', icon: TimerIcon, end: false },
    ],
  },
  {
    label: 'nav.group.work',
    items: [
      { to: '/waktu', key: 'work', icon: Clock, end: false },
      { to: '/projects', key: 'projects', icon: FolderGit2, end: false },
      { to: '/clients', key: 'clients', icon: Users, end: false },
      { to: '/assets', key: 'assets', icon: Server, end: false },
      { to: '/credentials', key: 'credentials', icon: KeyRound, end: false },
      { to: '/income', key: 'income', icon: Wallet, end: false },
      { to: '/expenses', key: 'expenses', icon: Receipt, end: false },
      { to: '/tracker', key: 'tracker', icon: ClipboardList, end: false },
      { to: '/monitor', key: 'monitor', icon: Activity, end: false },
    ],
  },
  {
    label: 'nav.group.personal',
    items: [
      { to: '/budget', key: 'budget', icon: PiggyBank, end: false },
      { to: '/documents', key: 'documents', icon: FileText, end: false },
      { to: '/belongings', key: 'belongings', icon: Package, end: false },
      { to: '/shopping', key: 'shopping', icon: ShoppingCart, end: false },
      { to: '/pasangan', key: 'partner', icon: Gift, end: false },
      { to: '/supplies', key: 'supplies', icon: ShoppingBasket, end: false },
      { to: '/makan', key: 'meals', icon: UtensilsCrossed, end: false },
      { to: '/people', key: 'people', icon: UserRound, end: false },
      { to: '/songs', key: 'songs', icon: Music, end: false },
      { to: '/setlists', key: 'setlists', icon: ListMusic, end: false },
    ],
  },
]

export const NAV = NAV_GROUPS.flatMap((group) => group.items)
export type NavItem = (typeof NAV)[number]

/*
Eleven destinations do not fit a phone, and a bar you have to scroll sideways
hides half of itself. Four live in the bar and the rest are one tap away in a
drawer.

Which four is a question about a phone rather than about the app. Supplies is
here because running out of something happens at unpredictable moments and
nothing else fetches you to it, so it has to be reachable from wherever you are
standing. Habits is here too, though it is the gentler case: the evening
notification already lands you on the check-in, so the tab is the second way in
rather than the only one.
*/
export const PRIMARY = ['home', 'calendar', 'supplies', 'habits']
export const TAB_KEYS = PRIMARY
/*
The habits tab goes somewhere else on a phone.

A tab is pressed to do a thing, and the thing here is ticking tonight's habits,
not reading the seven-day board. The sidebar still opens the board, because a
desktop is where you sit and look at a week; a phone is where you stand and
answer six questions. The board is one button away from the check-in either way.
*/
export const TABS = TAB_KEYS.map((key) => {
  const item = NAV.find((one) => one.key === key)!
  return key === 'habits' ? { ...item, to: '/habits/checkin', end: false } : item
})
