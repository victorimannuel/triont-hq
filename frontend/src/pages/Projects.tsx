import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useFileCounts } from '@/lib/useFileCounts'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Client, Project, Tag } from '@/types'
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
import { ErrorNote, PageHeader, StatusBadge } from '@/components/bits'
import { FileCount } from '@/components/Files'
import { SearchInput, FilterSelect } from '@/components/filters'
import { CardList, Responsive } from '@/components/cards'

export default function Projects() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'status', 'kind', 'client', 'tag'], api.projects, {
    projects: [] as Project[],
    clients: [] as Client[],
  })
  const { loading, error, query, filtered, update, clear } = list
  const fileCounts = useFileCounts('project')
  const projects = list.data.projects
  const clients = list.data.clients

  // The tag list is the same whatever the filters are, so it is fetched once.
  const [tags, setTags] = useState<Tag[]>([])
  useEffect(() => {
    api.tags().then((data) => setTags(data.tags)).catch(() => undefined)
  }, [])

  return (
    <>
      <PageHeader
        title={t('project.title')}
        description={loading ? t('common.loading') : t('project.found', { n: projects.length })}
        action={
          <Button asChild>
            <Link to="/projects/new">
              <Plus className="size-4" />
              {t('project.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('project.searchPlaceholder')}
        />

        <FilterSelect
          className="min-w-[8.5rem] flex-1 sm:max-w-[9.5rem]"
          value={query.status}
          onChange={(v) => update('status', v)}
          label={t('common.status')}
          options={meta.statuses.map((s) => ({ value: s.value, label: tOpt('status', s.value, s.label) }))}
        />
        <FilterSelect
          className="min-w-[8.5rem] flex-1 sm:max-w-[9.5rem]"
          value={query.kind}
          onChange={(v) => update('kind', v)}
          label={t('common.kind')}
          options={meta.kinds.map((k) => ({ value: k.value, label: tOpt('kind', k.value, k.label) }))}
        />
        <FilterSelect
          className="min-w-[8.5rem] flex-1 sm:max-w-[9.5rem]"
          value={query.client}
          onChange={(v) => update('client', v)}
          label={t('project.client')}
          options={clients.map((c) => ({ value: c.slug, label: c.name }))}
        />
        <FilterSelect
          className="min-w-[8.5rem] flex-1 sm:max-w-[9.5rem]"
          value={query.tag}
          onChange={(v) => update('tag', v)}
          label={"tag"}
          options={tags.map((tag) => ({ value: tag.slug, label: tag.name }))}
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
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('project.client')}</TableHead>
                  <TableHead>{t('common.kind')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('project.deploy')}</TableHead>
                  <TableHead className="text-right">{t('link.title')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.slug}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      {/* No underline: the whole row is the link already. */}
                      <div className="flex items-center gap-2 font-medium">
                        {project.name}
                        <FileCount n={fileCounts[project.id]} />
                      </div>
                      {project.local_path && (
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {project.local_path}
                        </div>
                      )}
                      {(project.tags ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {project.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.client_slug ? (
                        <Link
                          to={`/clients/${project.client_slug}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.client}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('kind', project.kind)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={project.status} label={tOpt('status', project.status)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {project.deploy_target || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {project.link_count}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && projects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t('project.noMatch')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        }
        cards={
          <CardList
            items={projects}
            keyOf={(p) => p.id}
            onPick={(p) => navigate(`/projects/${p.slug}`)}
            empty={loading ? null : t('project.noMatch')}
            render={(p) => ({
              title: p.name,
              subtitle: p.client || undefined,
              trailing: <StatusBadge status={p.status} label={tOpt('status', p.status)} />,
              meta: (
                <>
                  <span>{tOpt('kind', p.kind)}</span>
                  {p.deploy_target && <span className="font-mono">{p.deploy_target}</span>}
                  <span>
                    {p.link_count} {t('link.title')}
                  </span>
                  {(p.tags ?? []).map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border bg-secondary/60 px-2 py-0.5 text-[11px]"
                    >
                      {tag.name}
                    </span>
                  ))}
                  <FileCount n={fileCounts[p.id]} />
                </>
              ),
            })}
          />
        }
      />
    </>
  )
}
