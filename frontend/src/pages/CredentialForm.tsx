import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Credential, CredentialInput, Project } from '@/types'
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

const NONE = '__none__'

const blank: CredentialInput = {
  project_id: null,
  label: '',
  kind: 'login',
  username: '',
  host: '',
  url: '',
  notes: '',
  secret: '',
}

export default function CredentialForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<CredentialInput>(blank)
  const [record, setRecord] = useState<Credential | null>(null)
  const [hasSecret, setHasSecret] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .projects({})
      .then((data) => setProjects(data.projects))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) {
      const preset = params.get('project')
      if (preset) setForm((prev) => ({ ...prev, project_id: Number(preset) }))
      return
    }
    api
      .credentials({})
      .then((data) => {
        const found = data.credentials.find((c) => c.id === Number(id))
        if (!found) {
          setError(t('credential.notFound'))
          return
        }
        setRecord(found)
        setHasSecret(found.has_secret)
        setForm({
          project_id: found.project_id,
          label: found.label,
          kind: found.kind,
          username: found.username,
          host: found.host,
          url: found.url,
          notes: found.notes,
          secret: '',
        })
      })
      .catch((err) => setError(err.message))
  }, [id, params, t])

  function set<K extends keyof CredentialInput>(key: K, value: CredentialInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateCredential(Number(id), form)
      else await api.createCredential(form)
      toast.success(t('credential.saved'))
      navigate('/credentials')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
      setBusy(false)
    }
  }

  async function remove() {
    if (!id) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.label }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: form.label }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    await api.deleteCredential(Number(id))
    toast.success(t('credential.deleted'))
    navigate('/credentials')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/credentials"
        title={id ? t('credential.edit') : t('credential.new')}
        description={t('credential.secretNote')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('common.label')} htmlFor="label">
                <NameInput
                  id="label"
                  required
                  value={form.label}
                  onValue={(v) => set('label', v)}
                />
              </Field>
              <Field label={t('common.kind')}>
                <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.credential_kinds.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {tOpt('credkind', o.value, o.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={t('common.project')}>
              <Select
                value={form.project_id ? String(form.project_id) : NONE}
                onValueChange={(v) => set('project_id', v === NONE ? null : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('common.noProject')}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('credential.user')} htmlFor="username">
                <Input
                  id="username"
                  className="font-mono text-xs"
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                />
              </Field>
              <Field label={t('credential.host')} htmlFor="host">
                <Input
                  id="host"
                  className="font-mono text-xs"
                  value={form.host}
                  onChange={(e) => set('host', e.target.value)}
                />
              </Field>
            </div>

            <Field label={t('common.url')} htmlFor="url">
              <Input
                id="url"
                className="font-mono text-xs"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
              />
            </Field>

            <Field
              label={t('credential.secret')}
              htmlFor="secret"
              hint={hasSecret ? t('credential.secretKept') : undefined}
            >
              <Input
                id="secret"
                type="password"
                autoComplete="new-password"
                value={form.secret}
                onChange={(e) => set('secret', e.target.value)}
              />
            </Field>

            <Field label={t('common.notes')} htmlFor="notes">
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
                {t('common.save')}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/credentials">{t('common.cancel')}</Link>
              </Button>
              {id && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={remove}
                >
                  <Trash2 className="size-4" />
                  {t('common.delete')}
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
    </div>
  )
}
