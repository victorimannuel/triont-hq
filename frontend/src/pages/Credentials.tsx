import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Eye, EyeOff, Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useReveal } from '@/lib/useReveal'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Credential, Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorNote, PageHeader } from '@/components/bits'
import { FilterSelect, SearchInput } from '@/components/filters'
import { CardList, Responsive } from '@/components/cards'

// A revealed secret hides itself again, so a tab left open on a second monitor
// does not keep showing it.
export default function Credentials() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'project', 'kind'], api.credentials, {
    credentials: [] as Credential[],
  })
  const { error, query, filtered, update, clear } = list
  const credentials = list.data.credentials

  const [projects, setProjects] = useState<Project[]>([])
  useEffect(() => {
    api.projects({}).then((data) => setProjects(data.projects)).catch(() => undefined)
  }, [])

  const fetchSecret = useCallback(
    async (id: number) => (await api.reveal(id)).secret,
    [],
  )
  const { shown, reveal, copy: copyValue } = useReveal(
    fetchSecret,
    t('credential.revealFailed'),
  )
  const copy = (id: number) => copyValue(id, t('common.copied'), t('common.copyFailed'))

  return (
    <>
      <PageHeader
        title={t('credential.title')}
        description={t('credential.count', { n: credentials.length })}
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
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('credential.searchPlaceholder')}
        />
        <FilterSelect
          label={t('nav.projects')}
          value={query.project}
          onChange={(v) => update('project', v)}
          options={projects.map((p) => ({ value: p.slug, label: p.name }))}
          className="min-w-[8.5rem] flex-1 sm:max-w-[12rem]"
        />

        <FilterSelect
          label={t('common.kind')}
          value={query.kind}
          onChange={(v) => update('kind', v)}
          options={meta.credential_kinds.map((item) => ({
            value: item.value,
            label: tOpt('credkind', item.value, item.label),
          }))}
          className="min-w-[8.5rem] flex-1 sm:max-w-[10rem]"
        />

        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
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
                  <TableHead>{t('common.label')}</TableHead>
                  <TableHead>{t('nav.projects')}</TableHead>
                  <TableHead>{t('common.kind')}</TableHead>
                  <TableHead>{t('credential.user')}</TableHead>
                  <TableHead>{t('credential.secret')}</TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((credential) => (
                  <TableRow
                    key={credential.id}
                    onClick={() => navigate(`/credentials/${credential.id}`)}
                    className="cursor-pointer"
                  >
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
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                  </TableRow>
                ))}
                {credentials.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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
            onPick={(c) => navigate(`/credentials/${c.id}`)}
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
              // Revealing and copying must not open the record underneath.
              footer: c.has_secret ? (
                <div
                  className="flex flex-1 items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="flex-1 truncate font-mono text-xs">
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
                </div>
              ) : undefined,
            })}
          />
        }
      />
    </>
  )
}
