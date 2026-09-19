import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { TrackerInput, TrackerTask } from '@/types'
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
import { AuditInfo, ErrorNote, Field, PageHeader, Spinner } from '@/components/bits'

// The company is optional, so the select carries a "none" row that maps
// back to an empty string on the way out.
const NONE = '__none__'

const blank: TrackerInput = {
  priority: 'normal',
  project: 'general',
  area: '',
  task: '',
  owner: 'unassigned',
  status: 'todo',
  company: '',
  next_step: '',
  comment: '',
}

export default function TrackerForm() {
  const { id } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<TrackerInput>(blank)
  const [record, setRecord] = useState<TrackerTask | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .trackerTask(Number(id))
      .then((s) => {
        setRecord(s)
        setForm({
          priority: s.priority,
          project: s.project,
          area: s.area,
          task: s.task,
          owner: s.owner,
          status: s.status,
          company: s.company,
          next_step: s.next_step,
          comment: s.comment,
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  function set<K extends keyof TrackerInput>(key: K, value: TrackerInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateTracker(Number(id), form)
      else await api.createTracker(form)
      toast.success(t('tracker.saved'))
      navigate('/tracker')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failed'))
      setBusy(false)
    }
  }

  async function remove() {
    if (!id) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.task }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
    })
    if (!ok) return
    await api.deleteTracker(Number(id))
    toast.success(t('tracker.deleted'))
    navigate('/tracker')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/tracker"
        title={id ? form.task || t('tracker.title') : t('tracker.new')}
        description={t('tracker.subtitle')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <Field label={t('tracker.task')} htmlFor="task">
              <Textarea
                id="task"
                required
                rows={2}
                value={form.task}
                onChange={(e) => set('task', e.target.value)}
                placeholder={t('tracker.taskPlaceholder')}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('tracker.priority')}>
                <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.tracker_priorities.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('tracker.project')}>
                <Select value={form.project} onValueChange={(v) => set('project', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.tracker_projects.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('tracker.owner')}>
                <Select value={form.owner} onValueChange={(v) => set('owner', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.tracker_owners.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('tracker.status')}>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.tracker_statuses.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('tracker.company')}>
                <Select
                  value={form.company || NONE}
                  onValueChange={(v) => set('company', v === NONE ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('tracker.noCompany')}</SelectItem>
                    {meta.tracker_companies.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('tracker.area')} htmlFor="area">
                <Input
                  id="area"
                  value={form.area}
                  onChange={(e) => set('area', e.target.value)}
                  placeholder={t('tracker.areaPlaceholder')}
                />
              </Field>
            </div>

            <Field label={t('tracker.nextStep')} htmlFor="next_step">
              <Input
                id="next_step"
                value={form.next_step}
                onChange={(e) => set('next_step', e.target.value)}
              />
            </Field>

            <Field label={t('tracker.comment')} htmlFor="comment">
              <Textarea
                id="comment"
                rows={3}
                value={form.comment}
                onChange={(e) => set('comment', e.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t('common.save')}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/tracker">{t('common.cancel')}</Link>
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
