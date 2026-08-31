import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Document, DocumentInput } from '@/types'
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
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm'
import {
  AuditInfo,
  ErrorNote,
  Field,
  NameInput,
  PageHeader,
  Spinner,
} from '@/components/bits'
import { Files } from '@/components/Files'

const blank: DocumentInput = {
  name: '',
  kind: 'ktp',
  holder: '',
  issuer: '',
  issued_on: '',
  expires_on: '',
  location: '',
  notes: '',
  number: '',
}

export default function DocumentForm() {
  const { id } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<DocumentInput>(blank)
  const [record, setRecord] = useState<Document | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .document(Number(id))
      .then((d) => {
        setRecord(d)
        setForm({
          name: d.name,
          kind: d.kind,
          holder: d.holder,
          issuer: d.issuer,
          // The API sends a full timestamp; <input type="date"> wants YYYY-MM-DD.
          issued_on: d.issued_on ? d.issued_on.slice(0, 10) : '',
          expires_on: d.expires_on ? d.expires_on.slice(0, 10) : '',
          location: d.location,
          notes: d.notes,
          number: '',
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  function set<K extends keyof DocumentInput>(key: K, value: DocumentInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateDocument(Number(id), form)
      else await api.createDocument(form)
      toast.success('Dokumen disimpan')
      navigate('/documents')
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
    await api.deleteDocument(Number(id))
    toast.success('Dokumen dihapus')
    navigate('/documents')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={id ? 'Ubah dokumen' : 'Dokumen baru'}
        description="KTP, paspor, SIM, STNK, polis — apa pun yang punya masa berlaku. Nomornya disimpan ke-enkripsi."
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nama" htmlFor="name" hint="— misal “Paspor saya”">
                <NameInput
                  id="name"
                  required
                  value={form.name}
                  onValue={(v) => set('name', v)}
                />
              </Field>
              <Field label="Jenis">
                <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.document_kinds.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Pemilik" htmlFor="holder" hint="— punya siapa">
                <NameInput
                  id="holder"
                  value={form.holder}
                  onValue={(v) => set('holder', v)}
                />
              </Field>
              <Field label="Penerbit" htmlFor="issuer" hint="— Dukcapil, Imigrasi, …">
                <Input
                  id="issuer"
                  value={form.issuer}
                  onChange={(e) => set('issuer', e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Nomor"
              htmlFor="number"
              hint={record?.has_number ? '— sudah ada, isi cuma kalau mau ganti' : undefined}
            >
              <Input
                id="number"
                type="password"
                autoComplete="off"
                className="font-mono text-xs"
                value={form.number}
                onChange={(e) => set('number', e.target.value)}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Terbit" htmlFor="issued">
                <Input
                  id="issued"
                  type="date"
                  value={form.issued_on}
                  onChange={(e) => set('issued_on', e.target.value)}
                />
              </Field>
              <Field label="Berlaku sampai" htmlFor="expires">
                <Input
                  id="expires"
                  type="date"
                  value={form.expires_on}
                  onChange={(e) => set('expires_on', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Disimpan di" htmlFor="location" hint="— laci, brankas, map biru">
              <NameInput
                id="location"
                value={form.location}
                onValue={(v) => set('location', v)}
              />
            </Field>

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
                <Link to="/documents">Batal</Link>
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

      {id && <Files entity="document" id={Number(id)} />}
    </div>
  )
}
