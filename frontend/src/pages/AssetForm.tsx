import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Asset, AssetInput, Credential, Project } from '@/types'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm'
import { AuditInfo, ErrorNote, Field, MoneyInput, PageHeader, Spinner } from '@/components/bits'

const NONE = '__none__'

const blank: AssetInput = {
  name: '',
  kind: 'vps',
  provider: '',
  identifier: '',
  status: 'active',
  cost_amount: 0,
  cost_currency: 'IDR',
  credential_id: null,
  billing_cycle: 'yearly',
  renews_on: '',
  auto_renew: false,
  notes: '',
}

export default function AssetForm() {
  const { id } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<AssetInput>(blank)
  const [record, setRecord] = useState<Asset | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [attachDraft, setAttachDraft] = useState({ slug: '', role: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    api
      .asset(Number(id))
      .then((a) => {
        setRecord(a)
        setForm({
          name: a.name,
          kind: a.kind,
          provider: a.provider,
          identifier: a.identifier,
          status: a.status,
          cost_amount: a.cost_amount,
          cost_currency: a.cost_currency,
          credential_id: a.credential_id,
          billing_cycle: a.billing_cycle,
          // The API sends a full timestamp; <input type="date"> wants YYYY-MM-DD.
          renews_on: a.renews_on ? a.renews_on.slice(0, 10) : '',
          auto_renew: a.auto_renew,
          notes: a.notes,
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  useEffect(load, [load])

  useEffect(() => {
    if (!id) return
    api
      .projects({})
      .then((data) => setProjects(data.projects))
      .catch(() => undefined)
  }, [id])

  // Needed on a new asset too, so the account can be picked before saving.
  useEffect(() => {
    api
      .credentials({})
      .then((data) => setCredentials(data.credentials))
      .catch(() => undefined)
  }, [])

  async function attachProject(event: FormEvent) {
    event.preventDefault()
    if (!attachDraft.slug || !id) return
    try {
      await api.attachAsset(attachDraft.slug, Number(id), attachDraft.role)
      setAttachDraft({ slug: '', role: '' })
      toast.success('Project ditempelkan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal menempelkan project')
    }
  }

  async function detachProject(slug: string) {
    if (!id) return
    await api.detachAsset(slug, Number(id)).catch(() => undefined)
    toast.success('Project dilepas')
    load()
  }

  function set<K extends keyof AssetInput>(key: K, value: AssetInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateAsset(Number(id), form)
      else await api.createAsset(form)
      toast.success('Aset disimpan')
      navigate('/assets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gagal menyimpan')
      setBusy(false)
    }
  }

  async function remove() {
    if (!id) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.name }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: form.name }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    await api.deleteAsset(Number(id))
    toast.success('Aset dihapus')
    navigate('/assets')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={id ? 'Ubah aset' : 'Aset baru'}
        description="VPS, domain, sertifikat, atau apa pun yang jalan terus dan ada tanggal perpanjangannya."
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nama" htmlFor="name">
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  required
                />
              </Field>
              <Field label="Jenis">
                <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.asset_kinds.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Penyedia" htmlFor="provider" hint="— Biznet, Cloudflare, …">
                <Input
                  id="provider"
                  value={form.provider}
                  onChange={(e) => set('provider', e.target.value)}
                />
              </Field>
              <Field label="Penanda" htmlFor="identifier" hint="— IP, nama domain, nomor akun">
                <Input
                  id="identifier"
                  className="font-mono text-xs"
                  value={form.identifier}
                  onChange={(e) => set('identifier', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Akun penyedia"
                hint="— login yang dipakai daftar. Ambil dari credential biar nggak dobel."
              >
                <Select
                  value={form.credential_id ? String(form.credential_id) : NONE}
                  onValueChange={(v) => set('credential_id', v === NONE ? null : Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>belum dicatat</SelectItem>
                    {credentials.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.label}
                        {c.username ? ` — ${c.username}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Biaya" htmlFor="cost">
                <MoneyInput
                  id="cost"
                  value={form.cost_amount}
                  onValue={(v) => set('cost_amount', v)}
                />
              </Field>
              <Field label="Mata uang">
                <Select value={form.cost_currency} onValueChange={(v) => set('cost_currency', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.currencies.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Siklus">
                <Select value={form.billing_cycle} onValueChange={(v) => set('billing_cycle', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.billing_cycles.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Perpanjangan berikutnya" htmlFor="renews">
                <Input
                  id="renews"
                  type="date"
                  value={form.renews_on}
                  onChange={(e) => set('renews_on', e.target.value)}
                />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.asset_statuses.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={form.auto_renew}
                onChange={(e) => set('auto_renew', e.target.checked)}
              />
              Perpanjang otomatis
            </label>

            <Field label="Catatan" htmlFor="notes">
              <Textarea
                id="notes"
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                Simpan
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/assets">Batal</Link>
              </Button>
              {id && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={remove}
                >
                  <Trash2 className="size-4" />
                  Hapus
                </Button>
              )}
            </div>
          </form>

          {record && (
            <AuditInfo
              createdBy={record.created_by}
              createdAt={record.created_at}
              updatedBy={record.updated_by}
              updatedAt={record.updated_at}
            />
          )}
        </CardContent>
      </Card>

      {record && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Dipakai project</h2>

          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(record.projects ?? []).map((usage) => (
                  <TableRow key={usage.project_id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/projects/${usage.project_slug}`}
                        className="hover:underline"
                      >
                        {usage.project_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{usage.role || '—'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => detachProject(usage.project_slug)}
                        aria-label="Lepas project"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(record.projects ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Belum dipakai project mana pun.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={attachProject}>
            <Select
              value={attachDraft.slug}
              onValueChange={(v) => setAttachDraft({ ...attachDraft, slug: v })}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Pilih project" />
              </SelectTrigger>
              <SelectContent>
                {projects
                  .filter((p) => !(record.projects ?? []).some((u) => u.project_id === p.id))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.slug}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              className="w-48"
              placeholder="Peran (web, db, domain…)"
              value={attachDraft.role}
              onChange={(e) => setAttachDraft({ ...attachDraft, role: e.target.value })}
            />
            <Button type="submit" disabled={!attachDraft.slug}>
              <Plus className="size-4" />
              Tempelkan
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
