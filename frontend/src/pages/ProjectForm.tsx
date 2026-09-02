import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Client, ProjectInput } from '@/types'
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
import { ErrorNote, Field, NameInput, PageHeader, Spinner } from '@/components/bits'

const NONE = '__none__'

// Creating only. Editing happens in place on the project page.
const blank: ProjectInput = {
  name: '',
  client_id: null,
  status: 'active',
  kind: 'other',
  summary: '',
  local_path: '',
  deploy_target: '',
  notes: '',
}

export default function ProjectForm() {
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()

  const [form, setForm] = useState<ProjectInput>(blank)
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .clients()
      .then((data) => setClients(data.clients))
      .catch(() => undefined)
  }, [])

  function set<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createProject(form)
      toast.success(t('project.created'))
      navigate('/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('project.new')} description={t('project.onlyNameRequired')} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <Field label={t('common.name')} htmlFor="name">
              <NameInput
                id="name"
                required
                value={form.name}
                onValue={(v) => set('name', v)}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('project.client')}>
                <Select
                  value={form.client_id ? String(form.client_id) : NONE}
                  onValueChange={(v) => set('client_id', v === NONE ? null : Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.noClient')}</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('common.kind')}>
                <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.kinds.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {tOpt('kind', o.value, o.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('common.status')}>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.statuses.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {tOpt('status', o.value, o.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('project.deploy')} htmlFor="deploy" hint={t('project.deployHint')}>
                <Input
                  id="deploy"
                  className="font-mono text-xs"
                  value={form.deploy_target}
                  onChange={(e) => set('deploy_target', e.target.value)}
                />
              </Field>
            </div>

            <Field label={t('project.localPath')} htmlFor="path">
              <Input
                id="path"
                className="font-mono text-xs"
                value={form.local_path}
                onChange={(e) => set('local_path', e.target.value)}
              />
            </Field>

            <Field label={t('common.notes')} htmlFor="notes">
              <Textarea
                id="notes"
                rows={5}
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
                <Link to="/projects">{t('common.cancel')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
