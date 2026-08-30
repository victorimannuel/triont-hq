import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Eye, EyeOff, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Credential, Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { ErrorNote, PageHeader } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

const ALL = '__all__'

// A revealed secret hides itself again, so a tab left open on a second monitor
// does not keep showing it.
const HIDE_AFTER_MS = 30_000

export default function Credentials() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const [params, setParams] = useSearchParams()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [shown, setShown] = useState<Record<number, string>>({})
  const [error, setError] = useState('')

  const timers = useRef<Record<number, number>>({})

  const query = { project: params.get('project') ?? '', kind: params.get('kind') ?? '' }
  const filtered = Boolean(query.project || query.kind)

  useEffect(() => {
    api
      .credentials(query)
      .then((data) => setCredentials(data.credentials))
      .catch((err) => setError(err.message))
  }, [params])

  useEffect(() => {
    api
      .projects({})
      .then((data) => setProjects(data.projects))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => Object.values(pending).forEach((id) => window.clearTimeout(id))
  }, [])

  const hide = useCallback((id: number) => {
    window.clearTimeout(timers.current[id])
    delete timers.current[id]
    setShown((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  async function reveal(id: number) {
    if (shown[id] !== undefined) {
      hide(id)
      return
    }
    try {
      const { secret } = await api.reveal(id)
      setShown((prev) => ({ ...prev, [id]: secret }))
      timers.current[id] = window.setTimeout(() => hide(id), HIDE_AFTER_MS)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('credential.revealFailed'))
    }
  }

  async function copy(id: number) {
    try {
      const { secret } = await api.reveal(id)
      await navigator.clipboard.writeText(secret)
      toast.success(t('common.copied'))
    } catch {
      toast.error(t('common.copyFailed'))
    }
  }

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title={t('credential.title')}
        description={`${credentials.length} tersimpan. Isinya ke-enkripsi di database, baru kebuka kalau dipencet.`}
        action={
          <Button asChild>
            <Link to="/credentials/new">
              <Plus className="size-4" />
              {t('credential.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={query.project || ALL} onValueChange={(v) => update('project', v)}>
          <SelectTrigger className="w-[12rem]">
            <SelectValue placeholder={t('nav.projects')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.slug}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={query.kind || ALL} onValueChange={(v) => update('kind', v)}>
          <SelectTrigger className="w-[10rem]">
            <SelectValue placeholder={t('common.kind')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {meta.credential_kinds.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('credkind', item.value, item.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
            <X className="size-4" />
            {t('common.reset')}
          </Button>
        )}
      </div>

      <Responsive
        table={
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('link.label')}</TableHead>
                  <TableHead>{t('nav.projects')}</TableHead>
                  <TableHead>{t('common.kind')}</TableHead>
                  <TableHead>{t('credential.user')}</TableHead>
                  <TableHead>{t('credential.secret')}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((credential) => (
                  <TableRow key={credential.id}>
                    <TableCell>
                      <div className="font-medium">{credential.label}</div>
                      {credential.host && (
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {credential.host}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {credential.project_slug ? (
                        <Link
                          to={`/projects/${credential.project_slug}`}
                          className="hover:underline"
                        >
                          {credential.project_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('credkind', credential.kind)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{credential.username || '—'}</TableCell>
                    <TableCell>
                      {credential.has_secret ? (
                        <div className="flex items-center gap-1">
                          <span className="min-w-[7rem] font-mono text-xs">
                            {shown[credential.id] ?? '••••••••'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => reveal(credential.id)}
                            aria-label={shown[credential.id] !== undefined ? t('common.hide') : t('common.show')}
                          >
                            {shown[credential.id] !== undefined ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copy(credential.id)}
                            aria-label={t('common.copy')}
                          >
                            <Copy className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/credentials/${credential.id}`}>Ubah</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {credentials.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t('credential.none')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        }
        cards={
          <CardList
            items={credentials}
            keyOf={(c) => c.id}
            empty={t('credential.none')}
            render={(c) => ({
              title: c.label,
              subtitle: c.host || undefined,
              meta: (
                <>
                  <span>{tOpt('credkind', c.kind)}</span>
                  {c.username && <span className="font-mono">{c.username}</span>}
                  {c.project_slug && (
                    <Link to={`/projects/${c.project_slug}`} className="hover:underline">
                      {c.project_name}
                    </Link>
                  )}
                </>
              ),
              footer: (
                <>
                  {c.has_secret && (
                    <>
                      <span className="flex-1 self-center truncate font-mono text-xs">
                        {shown[c.id] ?? '••••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => reveal(c.id)}
                        aria-label={shown[c.id] !== undefined ? t('common.hide') : t('common.show')}
                      >
                        {shown[c.id] !== undefined ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copy(c.id)}
                        aria-label={t('common.copy')}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className={c.has_secret ? undefined : 'flex-1'}
                  >
                    <Link to={`/credentials/${c.id}`}>{t('common.edit')}</Link>
                  </Button>
                </>
              ),
            })}
          />
        }
      />
    </>
  )
}
