import type {
  Asset,
  AssetInput,
  Client,
  ClientInput,
  Contact,
  ContactInput,
  Credential,
  CredentialInput,
  Link,
  LinkInput,
  Meta,
  Overview,
  Belonging,
  BelongingInput,
  CalendarEntry,
  Document,
  DocumentInput,
  Hit,
  ExpenseInput,
  ExpenseStream,
  FxRate,
  IncomeInput,
  IncomeStream,
  MaintenanceInput,
  MaintenanceLog,
  Passkey,
  Check,
  MonitorSource,
  Attachment,
  Person,
  PersonInput,
  PurchaseInput,
  Supply,
  SupplyInput,
  SupplyPurchase,
  PushDevice,
  Project,
  ProjectInput,
  Tag,
  TrashEntity,
  TrashItem,
} from './types'
import type { CreationOptions, RequestOptions } from './webauthn'
import { currentLang, translate } from './i18n'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

// The session lives in an HttpOnly cookie, so nothing here touches a token.
// credentials: 'same-origin' is what carries it on every call.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(body.error ?? translate('common.requestFailed'), response.status)
  }
  return body as T
}

const send = <T,>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  // step: 'passkey' means the password checked out but a device still has to.
  login: (email: string, password: string) =>
    send<{ email: string; step?: 'passkey' }>('POST', '/auth/login', { email, password }),
  logout: () => send<void>('POST', '/auth/logout'),

  passkeys: () => request<{ passkeys: Passkey[] }>('/auth/passkeys'),
  // mode 'other' drops the platform pin so the browser offers its QR flow.
  passkeyEnrolBegin: (mode?: 'other') =>
    send<CreationOptions>('POST', `/auth/passkeys/begin${mode ? `?mode=${mode}` : ''}`),
  passkeyEnrolFinish: (name: string, device: string, credential: unknown) =>
    send<Passkey>(
      'POST',
      `/auth/passkeys/finish?name=${encodeURIComponent(name)}&device=${encodeURIComponent(device)}`,
      credential,
    ),
  pushKey: () => request<{ key: string; enabled: boolean }>('/push/key'),
  pushDevices: () =>
    request<{ subscriptions: PushDevice[] }>('/push/subscriptions'),
  pushSubscribe: (body: {
    endpoint: string
    keys: { p256dh: string; auth: string }
    device: string
    lang: string
  }) => send<{ status: string }>('POST', '/push/subscribe', body),
  pushUnsubscribe: (id: number) => send<void>('DELETE', `/push/subscriptions/${id}`),
  pushUnsubscribeHere: (endpoint: string) =>
    send<{ status: string }>('POST', '/push/unsubscribe', { endpoint }),
  // Arms the server-side alarm for a running countdown. The browser keeps the
  // clock; this only exists so the thing still goes off with HQ closed.
  armTimer: (body: { fires_at: number; label: string; kind: string; round: number }) =>
    send<{ status: string }>('PUT', '/timer', body),
  disarmTimer: () => send<{ status: string }>('DELETE', '/timer'),
  pushTest: () =>
    send<{ sent: number; devices: number; notices: number; preview: string }>('POST', '/push/test', {
      lang: currentLang(),
    }),

  renamePasskey: (id: number, name: string) =>
    send<Passkey>('PUT', `/auth/passkeys/${id}`, { name }),
  deletePasskey: (id: number) => send<void>('DELETE', `/auth/passkeys/${id}`),
  stepUpBegin: () => send<RequestOptions>('POST', '/auth/stepup/begin'),
  stepUpFinish: (credential: unknown, device = '') =>
    send<{ status: string }>(
      'POST',
      `/auth/stepup/finish?device=${encodeURIComponent(device)}`,
      credential,
    ),
  enrolLink: () =>
    send<{ url: string; expires_at: string }>('POST', '/auth/passkeys/link'),
  enrolBegin: (token: string) =>
    send<CreationOptions>('POST', '/auth/enrol/begin', { token }),
  enrolFinish: (name: string, device: string, credential: unknown) =>
    send<Passkey>(
      'POST',
      `/auth/enrol/finish?name=${encodeURIComponent(name)}&device=${encodeURIComponent(device)}`,
      credential,
    ),
  passkeyLoginBegin: () => send<RequestOptions>('POST', '/auth/passkey/login/begin'),
  // The device label rides along so a key registered before we recorded one
  // can learn it — the caller only sends it for a key held by this machine.
  passkeyLoginFinish: (credential: unknown, device = '') =>
    send<{ email: string }>(
      'POST',
      `/auth/passkey/login/finish?device=${encodeURIComponent(device)}`,
      credential,
    ),
  me: () => request<{ email: string }>('/auth/me'),
  meta: () => request<Meta>('/meta'),

  overview: () => request<Overview>('/overview'),

  monitor: () =>
    request<{ checks: Check[]; monitors: MonitorSource[] }>('/monitor'),

  search: (q: string) =>
    request<{ query: string; hits: Hit[] }>(`/search?q=${encodeURIComponent(q)}`),

  projects: (query: Record<string, string>) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ projects: Project[]; clients: Client[] }>(`/projects${suffix}`)
  },
  project: (slug: string) => request<Project>(`/projects/${slug}`),
  createProject: (input: ProjectInput) => send<Project>('POST', '/projects', input),
  updateProject: (slug: string, input: ProjectInput) =>
    send<Project>('PUT', `/projects/${slug}`, input),
  deleteProject: (slug: string) => send<void>('DELETE', `/projects/${slug}`),

  createLink: (slug: string, input: LinkInput) =>
    send<Link>('POST', `/projects/${slug}/links`, input),
  updateLink: (id: number, input: LinkInput) => send<Link>('PUT', `/links/${id}`, input),
  deleteLink: (id: number) => send<void>('DELETE', `/links/${id}`),

  credentials: (query: Record<string, string>) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ credentials: Credential[] }>(`/credentials${suffix}`)
  },
  createCredential: (input: CredentialInput) => send<Credential>('POST', '/credentials', input),
  updateCredential: (id: number, input: CredentialInput) =>
    send<Credential>('PUT', `/credentials/${id}`, input),
  deleteCredential: (id: number) => send<void>('DELETE', `/credentials/${id}`),
  reveal: (id: number) => send<{ secret: string }>('POST', `/credentials/${id}/reveal`),

  assets: (query: Record<string, string>) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ assets: Asset[] }>(`/assets${suffix}`)
  },
  asset: (id: number) => request<Asset>(`/assets/${id}`),
  createAsset: (input: AssetInput) => send<Asset>('POST', '/assets', input),
  updateAsset: (id: number, input: AssetInput) => send<Asset>('PUT', `/assets/${id}`, input),
  deleteAsset: (id: number) => send<void>('DELETE', `/assets/${id}`),

  clients: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ clients: Client[] }>(`/clients${suffix}`)
  },
  client: (slug: string) => request<Client>(`/clients/${slug}`),
  createClient: (input: ClientInput) => send<Client>('POST', '/clients', input),
  updateClient: (slug: string, input: ClientInput) =>
    send<Client>('PUT', `/clients/${slug}`, input),
  deleteClient: (slug: string) => send<void>('DELETE', `/clients/${slug}`),

  createContact: (slug: string, input: ContactInput) =>
    send<Contact>('POST', `/clients/${slug}/contacts`, input),
  updateContact: (id: number, input: ContactInput) =>
    send<Contact>('PUT', `/contacts/${id}`, input),
  deleteContact: (id: number) => send<void>('DELETE', `/contacts/${id}`),

  attachAsset: (slug: string, assetId: number, role: string) =>
    send<void>('POST', `/projects/${slug}/assets`, { asset_id: assetId, role }),
  detachAsset: (slug: string, assetId: number) =>
    send<void>('DELETE', `/projects/${slug}/assets/${assetId}`),

  documents: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ documents: Document[]; holders: string[] }>(`/documents${suffix}`)
  },
  document: (id: number) => request<Document>(`/documents/${id}`),
  createDocument: (input: DocumentInput) => send<Document>('POST', '/documents', input),
  updateDocument: (id: number, input: DocumentInput) =>
    send<Document>('PUT', `/documents/${id}`, input),
  deleteDocument: (id: number) => send<void>('DELETE', `/documents/${id}`),
  revealDocument: (id: number) =>
    send<{ number: string }>('POST', `/documents/${id}/reveal`),

  belongings: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ belongings: Belonging[] }>(`/belongings${suffix}`)
  },
  belonging: (id: number) => request<Belonging>(`/belongings/${id}`),
  createBelonging: (input: BelongingInput) => send<Belonging>('POST', '/belongings', input),
  updateBelonging: (id: number, input: BelongingInput) =>
    send<Belonging>('PUT', `/belongings/${id}`, input),
  deleteBelonging: (id: number) => send<void>('DELETE', `/belongings/${id}`),
  addMaintenance: (id: number, input: MaintenanceInput) =>
    send<MaintenanceLog>('POST', `/belongings/${id}/maintenance`, input),
  deleteMaintenance: (id: number) => send<void>('DELETE', `/maintenance/${id}`),

  people: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ people: Person[] }>(`/people${suffix}`)
  },
  person: (id: number) => request<Person>(`/people/${id}`),
  createPerson: (input: PersonInput) => send<Person>('POST', '/people', input),
  updatePerson: (id: number, input: PersonInput) =>
    send<Person>('PUT', `/people/${id}`, input),
  deletePerson: (id: number) => send<void>('DELETE', `/people/${id}`),
  touchPerson: (id: number) => send<void>('POST', `/people/${id}/touch`),

  calendar: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ from: string; to: string; entries: CalendarEntry[] }>(
      `/calendar${suffix}`,
    )
  },

  income: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ income: IncomeStream[]; monthly: Record<string, number> }>(
      `/income${suffix}`,
    )
  },
  incomeStream: (id: number) => request<IncomeStream>(`/income/${id}`),
  createIncome: (input: IncomeInput) => send<IncomeStream>('POST', '/income', input),
  updateIncome: (id: number, input: IncomeInput) =>
    send<IncomeStream>('PUT', `/income/${id}`, input),
  deleteIncome: (id: number) => send<void>('DELETE', `/income/${id}`),

  expenses: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ expenses: ExpenseStream[]; monthly: Record<string, number> }>(
      `/expenses${suffix}`,
    )
  },
  expenseStream: (id: number) => request<ExpenseStream>(`/expenses/${id}`),
  createExpense: (input: ExpenseInput) => send<ExpenseStream>('POST', '/expenses', input),
  updateExpense: (id: number, input: ExpenseInput) =>
    send<ExpenseStream>('PUT', `/expenses/${id}`, input),
  deleteExpense: (id: number) => send<void>('DELETE', `/expenses/${id}`),

  supplies: (query: Record<string, string> = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== ''),
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<{ supplies: Supply[]; low: number }>(`/supplies${suffix}`)
  },
  // Opening an item is exactly when "how long does this last" gets asked, so
  // its history comes with it.
  supply: (id: number) =>
    request<{ supply: Supply; purchases: SupplyPurchase[]; typical_days: number | null }>(
      `/supplies/${id}`,
    ),
  addPurchase: (id: number, input: PurchaseInput) =>
    send<Supply>('POST', `/supplies/${id}/purchases`, input),
  deletePurchase: (id: number) => send<Supply>('DELETE', `/purchases/${id}`),
  createSupply: (input: SupplyInput) => send<Supply>('POST', '/supplies', input),
  updateSupply: (id: number, input: SupplyInput) =>
    send<Supply>('PUT', `/supplies/${id}`, input),
  // delta nudges by a step; to fills back up and stamps the restock date.
  adjustSupply: (id: number, body: { delta?: number; to?: number }) =>
    send<Supply>('POST', `/supplies/${id}/adjust`, body),
  deleteSupply: (id: number) => send<void>('DELETE', `/supplies/${id}`),

  attachmentCounts: (entity: string) =>
    request<{ counts: Record<string, number> }>(`/files/${entity}/counts`),
  attachments: (entity: string, id: number) =>
    request<{ attachments: Attachment[] }>(`/files/${entity}/${id}`),
  // Multipart, so this one bypasses the JSON helper above.
  upload: async (entity: string, id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`/api/files/${entity}/${id}`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new ApiError(body.error ?? translate('file.uploadFailed'), response.status)
    }
    return (await response.json()) as Attachment
  },
  // A plain link: the browser fetches it with the session cookie, and the
  // response is never cached because it is decrypted personal data.
  downloadUrl: (id: number) => `/api/files/${id}/download`,
  deleteAttachment: (id: number) => send<void>('DELETE', `/files/${id}`),

  rates: () => request<{ rates: FxRate[] }>('/fx'),
  refreshRates: () => send<{ rates: FxRate[] }>('POST', '/fx/refresh'),

  tags: () => request<{ tags: Tag[] }>('/tags'),
  deleteTag: (id: number) => send<void>('DELETE', `/tags/${id}`),
  tagProject: (slug: string, name: string) =>
    send<Tag>('POST', `/projects/${slug}/tags`, { name }),
  untagProject: (slug: string, tagId: number) =>
    send<void>('DELETE', `/projects/${slug}/tags/${tagId}`),

  trash: () => request<{ items: TrashItem[] }>('/trash'),
  restore: (entity: TrashEntity, id: number) =>
    send<void>('POST', `/trash/${entity}/${id}/restore`),
  purge: (entity: TrashEntity, id: number) => send<void>('DELETE', `/trash/${entity}/${id}`),
}
