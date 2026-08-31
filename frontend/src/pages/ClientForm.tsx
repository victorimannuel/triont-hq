import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Check,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Client, ClientInput, Contact, ContactInput } from '@/types'
import { Badge } from '@/components/ui/badge'
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
import {
  AuditInfo,
  ErrorNote,
  Field,
  Loading,
  NameInput,
  Spinner,
  StatusBadge,
} from '@/components/bits'

const blankClient: ClientInput = {
  name: '',
  kind: 'company',
  company: '',
  status: 'active',
  notes: '',
}
const blankContact: ContactInput = {
  name: '',
  role: '',
  email: '',
  phone: '',
  is_primary: false,
  notes: '',
}

function toInput(c: Client): ClientInput {
  return { name: c.name, kind: c.kind, company: c.company, status: c.status, notes: c.notes }
}

export default function ClientForm() {
  const { slug } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [record, setRecord] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientInput>(blankClient)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [draft, setDraft] = useState<ContactInput>(blankContact)
  const [editingContact, setEditingContact] = useState<number | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactInput>(blankContact)

  const load = useCallback(() => {
    if (!slug) return
    api
      .client(slug)
      .then((c) => {
        setRecord(c)
        setForm(toInput(c))
      })
      .catch((err) => setError(err.message))
  }, [slug])

  useEffect(load, [load])

  // On an existing client the page edits in place, so the save bar only shows
  // once something differs from what is stored.
  const dirty = useMemo(
    () => Boolean(record && JSON.stringify(toInput(record)) !== JSON.stringify(form)),
    [record, form],
  )

  function set<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (slug) {
        const saved = await api.updateClient(slug, form)
        toast.success('Klien disimpan')
        if (saved.slug !== slug) navigate(`/clients/${saved.slug}`, { replace: true })
        else load()
      } else {
        await api.createClient(form)
        toast.success('Klien dibuat')
        navigate('/clients')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  async function removeClient() {
    if (!slug) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.name }),
      body: t('confirm.deleteClientBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: form.name }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    await api.deleteClient(slug)
    toast.success('Klien dihapus')
    navigate('/clients')
  }

  async function addContact(event: FormEvent) {
    event.preventDefault()
    if (!slug) return
    try {
      await api.createContact(slug, draft)
      setDraft(blankContact)
      toast.success('Kontak ditambahkan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal nambah kontak')
    }
  }

  function startEditContact(contact: Contact) {
    setEditingContact(contact.id)
    setContactDraft({
      name: contact.name,
      role: contact.role,
      email: contact.email,
      phone: contact.phone,
      is_primary: contact.is_primary,
      notes: contact.notes,
    })
  }

  async function saveContact() {
    if (editingContact === null) return
    try {
      await api.updateContact(editingContact, contactDraft)
      setEditingContact(null)
      toast.success('Kontak disimpan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal menyimpan kontak')
    }
  }

  async function removeContact(id: number) {
    if (!(await confirm({ title: t('confirm.removeContactTitle', { name: '' }), danger: true })))
      return
    await api.deleteContact(id).catch(() => undefined)
    if (editingContact === id) setEditingContact(null)
    toast.success('Kontak dihapus')
    load()
  }

  if (slug && !record && !error) return <Loading />

  return (
    <div className="mx-auto max-w-3xl">
      {slug && dirty && (
        <div className="sticky top-14 z-30 md:top-0 -mx-4 mb-6 flex items-center gap-3 border-b bg-popover/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm text-muted-foreground">Ada perubahan yang belum disimpan.</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => record && setForm(toInput(record))}
            >
              <RotateCcw className="size-4" />
              Batal
            </Button>
            <Button size="sm" onClick={() => save()} disabled={busy}>
              {busy && <Spinner />}
              Simpan
            </Button>
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {slug ? form.name || 'Tanpa nama' : 'Klien baru'}
          </h1>
          {slug && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {meta.client_statuses.find((s) => s.value === form.status)?.label ?? form.status}
              </Badge>
              <Badge variant="secondary">{tOpt('clientkind', form.kind)}</Badge>
            </div>
          )}
        </div>
        {slug && (
          <Button variant="ghost" className="text-destructive" onClick={removeClient}>
            <Trash2 className="size-4" />
            Hapus
          </Button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={save}>
            <Field label={t('client.kind')}>
              <div className="flex w-fit items-center gap-1 rounded-md border p-0.5">
                {meta.client_kinds.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={form.kind === item.value ? 'secondary' : 'ghost'}
                    onClick={() => set('kind', item.value)}
                  >
                    {tOpt('clientkind', item.value, item.label)}
                  </Button>
                ))}
              </div>
            </Field>

            {/* One name field. A company has a company name, a person has a
                person name — there is never a reason to type both. */}
            <Field
              label={form.kind === 'person' ? t('client.personName') : t('client.companyName')}
              htmlFor="name"
            >
              <NameInput
                id="name"
                required
                value={form.name}
                onValue={(v) => set('name', v)}
              />
            </Field>

            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="w-full sm:w-1/2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.client_statuses.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Catatan" htmlFor="notes">
              <Textarea
                id="notes"
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>

            {!slug && (
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner />}
                  Simpan
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/clients">Batal</Link>
                </Button>
              </div>
            )}
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
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Kontak</h2>

          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(record.contacts ?? []).map((contact) =>
                  editingContact === contact.id ? (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <Input
                          value={contactDraft.name}
                          onChange={(e) =>
                            setContactDraft({ ...contactDraft, name: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={contactDraft.role}
                          onChange={(e) =>
                            setContactDraft({ ...contactDraft, role: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="email"
                          value={contactDraft.email}
                          onChange={(e) =>
                            setContactDraft({ ...contactDraft, email: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={contactDraft.phone}
                          onChange={(e) =>
                            setContactDraft({ ...contactDraft, phone: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setContactDraft({
                                ...contactDraft,
                                is_primary: !contactDraft.is_primary,
                              })
                            }
                            aria-label="Kontak utama"
                            title="Kontak utama"
                          >
                            <Star
                              className={
                                contactDraft.is_primary
                                  ? 'size-4 fill-current text-warning'
                                  : 'size-4 text-muted-foreground'
                              }
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={saveContact}
                            aria-label="Simpan"
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                            onClick={() => setEditingContact(null)}
                            aria-label="Batal"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {contact.is_primary && (
                            <Star className="size-3.5 fill-current text-warning" />
                          )}
                          {contact.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.role || '—'}
                      </TableCell>
                      <TableCell>
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Mail className="size-3.5" />
                            {contact.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.phone ? (
                          <a
                            href={`tel:${contact.phone.replace(/\s/g, '')}`}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            <Phone className="size-3.5" />
                            {contact.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                            onClick={() => startEditContact(contact)}
                            aria-label="Ubah kontak"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeContact(contact.id)}
                            aria-label="Hapus kontak"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ),
                )}
                {(record.contacts ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Belum ada kontak.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={addContact}>
            <Input
              className="w-40"
              placeholder="Nama"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <Input
              className="w-36"
              placeholder="Jabatan"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
            <Input
              className="w-52"
              type="email"
              placeholder="Email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Input
              className="w-40"
              placeholder="Telepon"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <Button type="submit">
              <Plus className="size-4" />
              Tambah
            </Button>
          </form>

          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Project</h2>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(record.projects ?? []).map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link to={`/projects/${project.slug}`} className="hover:underline">
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {meta.kinds.find((k) => k.value === project.kind)?.label ?? project.kind}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={project.status}
                        label={
                          meta.statuses.find((s) => s.value === project.status)?.label ??
                          project.status
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {(record.projects ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Belum ada project buat klien ini.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

    </div>
  )
}
