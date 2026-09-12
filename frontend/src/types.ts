export type Option = { value: string; label: string }

export type PushDevice = {
  id: number
  device: string
  created_at: string
  last_sent_at: string | null
  failures: number
}

/**
 * One notification that has already gone out. A notification is the only part
 * of HQ that leaves no trace you can look at afterwards, so this is the record
 * of what it said. A kind of 'digest' is the daily roundup, which is about
 * everything at once and so has no link of its own.
 */
export type SentNotice = {
  key: string
  read: boolean
  sent_on: string
  sent_at: string
  kind: string
  label: string
  url: string
  due_on: string
}

export type Passkey = {
  id: number
  name: string
  device: string
  user_agent: string
  location: string
  ip: string
  created_at: string
  last_used_at: string | null
  last_used_ip: string
  last_used_location: string
}

export type Hit = {
  entity: string
  id: number
  title: string
  subtitle: string
  detail: string
  url: string
}

/** One line for one day. Days with nothing written have no row at all. */
export type JournalDay = {
  /** YYYY-MM-DD. */
  on: string
  line: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

/** Something meant to get done most days, and how it is going. */
export type Habit = Audit & {
  id: number
  name: string
  notes: string
  active: boolean
  /** The days inside the asked-for window that were done, as YYYY-MM-DD. */
  days: string[]
  /** Consecutive days up to now. Today not being ticked yet does not break it. */
  streak: number
  last_seven: number
  /** What a day of this is counted in: "kali", "pasal", "menit". Empty means
   *  the habit is a plain yes or no. */
  unit: string
  /** Added up across the window that was asked for, and today on its own.
   *  Both are meaningless without a unit. */
  total: number
  today: number
  /** What each day inside the window came to, keyed as YYYY-MM-DD. Empty for a
   *  habit with no unit, where every entry would just read 1. */
  amounts: Record<string, number>
  /** The first image attached, for the check-in to show. Null when there is none. */
  image_id: number | null
}

export type HabitInput = {
  name: string
  notes: string
  unit: string
  active: boolean
}

/** An evening's worth of songs, in the order they get played. */
export type Setlist = Audit & {
  id: number
  name: string
  plays_on: string | null
  notes: string
  song_count: number
}

/** One place in a running order: the song, plus what this evening does to it.
 *  The id is the row's own, not the song's — a song can appear twice. */
export type SetlistSong = {
  id: number
  song: Song
  /** Semitones this evening wants it moved from the key it is written in. */
  steps: number
}

export type SetlistInput = {
  name: string
  plays_on: string
  notes: string
}

/** A chord chart. The body is stored exactly as typed — the column a chord
 *  sits in says which syllable it lands on, so nothing reformats it. */
export type Song = Audit & {
  id: number
  title: string
  artist: string
  /** The key the body is written in. Transposing never rewrites this. */
  key: string
  tempo: number
  /** 'bass', 'piano', or empty when the same chart suits both. */
  part: string
  body: string
  notes: string
}

export type SongInput = {
  title: string
  artist: string
  key: string
  tempo: number
  part: string
  body: string
  notes: string
}

/** A line on one of the two lists. Same row either way; `kind` says which page
 *  it belongs to. A deadline is a to-do's only, and null until one is set. */
export type Task = Audit & {
  id: number
  kind: 'todo' | 'buy'
  title: string
  due_on: string | null
  /** When it was ticked. Null while it is still open. */
  done_at: string | null
}

export type TaskKind = Task['kind']

export type TaskInput = {
  title: string
  due_on: string
}

export type Supply = Audit & {
  id: number
  name: string
  category: string
  location: string
  unit: string
  quantity: number
  low_at: number
  /** Computed by the server: quantity has reached the threshold. */
  low: boolean
  notes: string
  last_restocked_on: string | null
}

export type SupplyPurchase = {
  id: number
  supply_id: number
  bought_on: string
  quantity: number
  price: number
  currency: string
  vendor: string
  notes: string
  created_by: string
  created_at: string
  /** Days since the previous purchase; null for the first one. */
  since_last: number | null
}

export type PurchaseInput = {
  bought_on: string
  quantity: number
  price: number
  currency: string
  vendor: string
  notes: string
}

export type SupplyInput = {
  name: string
  category: string
  location: string
  unit: string
  quantity: number
  low_at: number
  notes: string
  last_restocked_on: string
}

export type Check = {
  id: number
  source: string
  key: string
  name: string
  status: 'ok' | 'warn' | 'down'
  detail: string
  url: string
  /** When this state began, not when it was last confirmed. */
  since_at: string
  checked_at: string
}

export type MonitorSource = {
  source: string
  last_seen_at: string
  silent_after_minutes: number
  /** It has stopped reporting, which is a problem in itself. */
  stale: boolean
  problems: number
  total: number
}

export type Attachment = {
  id: number
  entity: string
  entity_id: number
  name: string
  mime_type: string
  /** The original file's size, not the ciphertext's. */
  size: number
  notes: string
  created_by: string
  created_at: string
}

export type Tag = {
  id: number
  slug: string
  name: string
  color: string
  use_count?: number
}

export type IncomeStream = Audit & {
  id: number
  name: string
  client_id: number | null
  client_name: string
  client_slug: string
  project_id: number | null
  project_name: string
  project_slug: string
  amount: number
  currency: string
  cycle: string
  status: string
  started_on: string | null
  ended_on: string | null
  next_due_on: string | null
  notes: string
}

export type IncomeInput = {
  name: string
  client_id: number | null
  project_id: number | null
  amount: number
  currency: string
  cycle: string
  status: string
  started_on: string
  ended_on: string
  next_due_on: string
  notes: string
}

export type ExpenseStream = Audit & {
  id: number
  /** 'asset' rows are derived from a paid asset and edited over there. */
  source: 'expense' | 'asset'
  asset_id: number | null
  asset_name: string
  name: string
  category: string
  project_id: number | null
  project_name: string
  project_slug: string
  amount: number
  currency: string
  cycle: string
  status: string
  started_on: string | null
  ended_on: string | null
  next_due_on: string | null
  notes: string
}

export type ExpenseInput = {
  asset_id: number | null
  name: string
  category: string
  project_id: number | null
  amount: number
  currency: string
  cycle: string
  status: string
  started_on: string
  ended_on: string
  next_due_on: string
  notes: string
}

/** Where money sits. The balance is typed in and trusted as typed. */
export type MoneyAccount = Audit & {
  id: number
  name: string
  balance: number
  currency: string
  position: number
  notes: string
}

export type MoneyAccountInput = {
  name: string
  balance: number
  currency: string
  notes: string
}

/** One allocation inside a month: a thing the money is promised to, and
 *  whether that has happened yet. */
export type BudgetLine = Audit & {
  id: number
  on_month: string
  name: string
  account_id: number | null
  account_name: string
  bucket: string
  /** What it is worth this month. Worked out from income when `percent` is
   *  set, so a raise moves every share without any of them being edited. */
  amount: number
  percent: number | null
  paid: boolean
  /** The day it falls due, or '' when it is just some time this month. */
  due_on: string
  expense_id: number | null
  position: number
  notes: string
}

export type BudgetLineInput = {
  name: string
  account_id: number | null
  bucket: string
  amount: number
  percent: number | null
  due_on: string
  notes: string
}

/** One thing expected to come in this month: a salary, an invoice, a fee. */
export type BudgetIncome = Audit & {
  id: number
  on_month: string
  name: string
  amount: number
  /** What the source pays in. `converted` is the same money in the month's
   *  currency, which is what every total and percentage is built from. */
  currency: string
  converted: number
  account_id: number | null
  account_name: string
  received: boolean
  /** The day it is expected, or '' when no day was given. */
  due_on: string
  position: number
  notes: string
}

export type BudgetIncomeInput = {
  name: string
  amount: number
  currency: string
  account_id: number | null
  due_on: string
  notes: string
}

export type BucketRoll = {
  bucket: string
  amount: number
  percent: number
  /** Zero means no opinion has been set, not "should be nothing". */
  target: number
  unpaid: number
}

export type BudgetMonth = {
  /** Which month the pool came from, as YYYY-MM: a month spends what the one
   *  before it earned. */
  pool_from: string
  /** The first of the month, as YYYY-MM-DD. */
  on_month: string
  /** Everything expected in, added up from `incomes`. Shares are worked out
   *  against this; `received` is what has actually landed. */
  income: number
  received: number
  incomes: BudgetIncome[]
  /** A source is in a currency with no stored rate, so the total is short. */
  missing: boolean
  currency: string
  notes: string
  lines: BudgetLine[]
  buckets: BucketRoll[]
  allocated: number
  /** Income minus everything promised. Negative is the point. */
  left: number
  unpaid: number
}

export type FxRate = {
  currency: string
  rate: number
  fetched_at: string
}

export type TrashEntity =
  | 'project'
  | 'client'
  | 'asset'
  | 'credential'
  | 'document'
  | 'belonging'
  | 'person'
  | 'income'
  | 'expense'
  | 'supply'
  | 'song'
  | 'setlist'
  | 'habit'
  // Rows that hang off one of the above. A journal day carries its date as
  // YYYYMMDD for an id, because it has no id of its own.
  | 'link'
  | 'maintenance'
  | 'purchase'
  | 'setlistsong'
  | 'file'
  | 'task'
  | 'journal'

export type TrashItem = {
  entity: TrashEntity
  id: number
  label: string
  detail: string
  deleted_by: string
  deleted_at: string
}

export type Meta = {
  statuses: Option[]
  kinds: Option[]
  link_categories: Option[]
  credential_kinds: Option[]
  asset_kinds: Option[]
  asset_statuses: Option[]
  billing_cycles: Option[]
  currencies: Option[]
  client_statuses: Option[]
  client_kinds: Option[]
  ownerships: Option[]
  conditions: Option[]
  income_statuses: Option[]
  expense_categories: Option[]
  document_kinds: Option[]
  belonging_kinds: Option[]
  belonging_statuses: Option[]
  maintenance_kinds: Option[]
  supply_categories: Option[]
  supply_units: Option[]
  song_parts: Option[]
  budget_buckets: Option[]
}

export type Contact = Audit & {
  id: number
  client_id: number | null
  name: string
  nickname: string
  role: string
  email: string
  phone: string
  is_primary: boolean
  notes: string
  birthday: string | null
  last_contacted_on: string | null
  reach_every_days: number
}

export type ContactInput = {
  name: string
  role: string
  email: string
  phone: string
  is_primary: boolean
  notes: string
}

export type Client = Audit & {
  id: number
  slug: string
  name: string
  kind: string
  company: string
  status: string
  notes: string
  project_count: number
  contact_count: number
  contacts?: Contact[]
  projects?: Project[]
}

export type ClientInput = {
  name: string
  kind: string
  company: string
  status: string
  notes: string
}

export type Audit = {
  created_by: string
  updated_by?: string
  created_at: string
  updated_at?: string
}

export type Link = Audit & {
  id: number
  project_id: number
  label: string
  url: string
  category: string
  notes: string
}

export type LinkInput = {
  label: string
  url: string
  category: string
  notes: string
}

export type Credential = Audit & {
  id: number
  project_id: number | null
  project_name: string
  project_slug: string
  label: string
  kind: string
  username: string
  host: string
  url: string
  notes: string
  has_secret: boolean
}

export type Project = Audit & {
  id: number
  slug: string
  name: string
  client_id: number | null
  /** Resolved client name, filled by the server from the join. */
  client: string
  client_slug: string
  status: string
  kind: string
  summary: string
  local_path: string
  deploy_target: string
  notes: string
  link_count: number
  credential_count: number
  tags: Tag[]
  links?: Link[]
  credentials?: Credential[]
  assets?: AssetUsage[]
  income?: IncomeStream[]
}

export type AssetUsage = {
  project_id: number
  project_slug: string
  project_name: string
  asset_id: number
  asset_name: string
  asset_kind: string
  provider: string
  identifier: string
  role: string
}

export type Asset = Audit & {
  id: number
  /** Which login the thing is registered under. */
  credential_id: number | null
  credential_label: string
  credential_user: string
  name: string
  kind: string
  provider: string
  identifier: string
  status: string
  cost_amount: number
  cost_currency: string
  billing_cycle: string
  renews_on: string | null
  auto_renew: boolean
  notes: string
  project_count: number
  projects?: AssetUsage[]
}

export type AssetInput = {
  credential_id: number | null
  name: string
  kind: string
  provider: string
  identifier: string
  status: string
  cost_amount: number
  cost_currency: string
  billing_cycle: string
  renews_on: string
  auto_renew: boolean
  notes: string
}

export type Document = Audit & {
  id: number
  name: string
  kind: string
  holder: string
  issuer: string
  issued_on: string | null
  expires_on: string | null
  location: string
  notes: string
  has_number: boolean
  tags: Tag[]
}

export type DocumentInput = {
  name: string
  kind: string
  holder: string
  issuer: string
  issued_on: string
  expires_on: string
  location: string
  notes: string
  number: string
}

export type MaintenanceLog = {
  id: number
  belonging_id: number
  done_on: string
  kind: string
  odometer: number | null
  description: string
  vendor: string
  cost: number
  next_due: string | null
  created_by: string
  created_at: string
}

export type MaintenanceInput = {
  done_on: string
  kind: string
  odometer: number | null
  description: string
  vendor: string
  cost: number
  next_due: string
}

export type Belonging = Audit & {
  id: number
  name: string
  kind: string
  brand: string
  model: string
  year: number | null
  identifier: string
  acquired_on: string | null
  price: number
  currency: string
  warranty_until: string | null
  location: string
  ownership: string
  condition: string
  rent_amount: number
  rent_cycle: string
  rent_due_on: string | null
  status: string
  notes: string
  next_due: string | null
  logs?: MaintenanceLog[]
  tags: Tag[]
}

export type BelongingInput = {
  name: string
  kind: string
  brand: string
  model: string
  year: number | null
  identifier: string
  acquired_on: string
  price: number
  currency: string
  warranty_until: string
  location: string
  ownership: string
  condition: string
  rent_amount: number
  rent_cycle: string
  rent_due_on: string
  status: string
  notes: string
}

export type Person = Contact & {
  client_name: string
  client_slug: string
  due_to_reach: boolean
}

export type PersonInput = {
  client_id: number | null
  name: string
  nickname: string
  role: string
  email: string
  phone: string
  notes: string
  birthday: string
  last_contacted_on: string
  reach_every_days: number
}

/** One date already closed off, with whatever was written about it. */
export type CalendarMark = {
  kind: string
  /** YYYY-MM-DD. */
  on: string
  note: string
}

export type CalendarEntry = {
  /** Closed off by hand, with whatever was written about it at the time. */
  done?: boolean
  note?: string
  date: string
  kind: string
  label: string
  detail: string
  url: string
  // Days lived, for a milestone. Zero for every other kind.
  count: number
}

export type Overview = {
  upcoming: CalendarEntry[]
  /** Today's ticking, as a tally. The board itself is a page away. */
  habits_done: number
  habits_total: number
  /** The ones still open today, by name and in the board's order. */
  habits_left: string[]
  low_supplies: Supply[]
  trouble: Check[]
  stale_monitors: MonitorSource[]
}

export type ProjectInput = {
  name: string
  client_id: number | null
  status: string
  kind: string
  summary: string
  local_path: string
  deploy_target: string
  notes: string
}

export type CredentialInput = {
  project_id: number | null
  label: string
  kind: string
  username: string
  host: string
  url: string
  notes: string
  secret: string
}
