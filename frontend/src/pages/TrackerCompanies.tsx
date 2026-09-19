import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useRefreshMeta } from '@/App'
import { useT } from '@/i18n'
import type { TrackerCompany } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorNote, Loading, PageHeader, Spinner } from '@/components/bits'
import { useConfirm } from '@/components/confirm'

/**
 * Managing the tracker's companies: the list that fills the landing pills and the
 * company field on a task. Editing a name is safe — a task points at a company by
 * a slug that never changes here — so the whole page is a list you type straight
 * into, plus one field to add and a bin to remove.
 */
export default function TrackerCompanies() {
  const { t } = useT()
  const confirm = useConfirm()
  // The tracker's pills and company field read the shared meta; refresh it after
  // a change here so they pick the edit up without a reload.
  const refreshMeta = useRefreshMeta()
  const [companies, setCompanies] = useState<TrackerCompany[] | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // What a name field held when it was focused, so a blur only saves a real edit.
  const before = useRef('')

  function load() {
    api
      .trackerCompanies()
      .then((data) => {
        setCompanies(data.companies)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.requestFailed')))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await api.createTrackerCompany(trimmed)
      setName('')
      load()
      refreshMeta()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function rename(id: number, next: string) {
    const trimmed = next.trim()
    if (!trimmed || trimmed === before.current) return
    setCompanies((list) =>
      (list ?? []).map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    )
    try {
      await api.updateTrackerCompany(id, trimmed)
      refreshMeta()
    } catch {
      toast.error(t('common.saveFailed'))
      load()
    }
  }

  async function remove(company: TrackerCompany) {
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: company.name }),
      body: t('trackerCompany.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    setCompanies((list) => (list ?? []).filter((c) => c.id !== company.id))
    try {
      await api.deleteTrackerCompany(company.id)
      refreshMeta()
    } catch {
      toast.error(t('common.deleteFailed'))
      load()
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/tracker"
        title={t('trackerCompany.title')}
        description={t('trackerCompany.subtitle')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <form className="mb-4 flex gap-2" onSubmit={add}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('trackerCompany.placeholder')}
          className="flex-1"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : <Plus className="size-4" />}
          {t('trackerCompany.add')}
        </Button>
      </form>

      {companies === null ? (
        <Loading />
      ) : companies.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          {t('trackerCompany.none')}
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {companies.map((company) => (
            <div key={company.id} className="flex items-center gap-2 px-3 py-2">
              <input
                className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-sm font-medium hover:bg-accent focus:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
                value={company.name}
                onFocus={() => (before.current = company.name)}
                onChange={(event) =>
                  setCompanies((list) =>
                    (list ?? []).map((c) =>
                      c.id === company.id ? { ...c, name: event.target.value } : c,
                    ),
                  )
                }
                onBlur={(event) => rename(company.id, event.target.value)}
              />
              <button
                type="button"
                onClick={() => remove(company)}
                aria-label={t('common.delete')}
                title={t('common.delete')}
                className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
