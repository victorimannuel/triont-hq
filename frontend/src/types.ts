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

export type CalendarEntry = {
  date: string
  kind: string
  label: string
  detail: string
  url: string
  // Days lived, for a milestone. Zero for every other kind.
  count: number
}

export type Overview = {
  total_projects: number
  total_credentials: number
  total_assets: number
  total_clients: number
  total_documents: number
  total_belongings: number
  total_people: number
  total_income: number
  monthly_income: Record<string, number>
  total_expenses: number
  monthly_expense: Record<string, number>
  rates: FxRate[]
  recent: Project[]
  upcoming: CalendarEntry[]
  total_supplies: number
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
