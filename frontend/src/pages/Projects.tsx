import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Client, Project, Tag } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { ErrorNote, PageHeader, StatusBadge } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

const ALL = '__all__'

export default function Projects() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const query = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    kind: params.get('kind') ?? '',
    client: params.get('client') ?? '',
    tag: params.get('tag') ?? '',
  }
  const filtered = Boolean(query.q || query.status || query.kind || query.client || query.tag)

  useEffect(() => {
    setLoading(true)
    api
      .projects(query)
      .then((data) => {
        setProjects(data.projects)
        setClients(data.clients)
        setError('')
      })
      .then(() => api.tags().then((data) => setTags(data.tags)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // The URL is the single source of truth for filter state.
  }, [params])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

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
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('project.searchPlaceholder')}
            value={query.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>

        <FilterSelect
          value={query.status}
          onChange={(v) => update('status', v)}
          placeholder={t('common.status')}
          options={meta.statuses.map((s) => ({ value: s.value, label: tOpt('status', s.value, s.label) }))}
        />
        <FilterSelect
          value={query.kind}
          onChange={(v) => update('kind', v)}
          placeholder={t('common.kind')}
          options={meta.kinds.map((k) => ({ value: k.value, label: tOpt('kind', k.value, k.label) }))}
        />
        <FilterSelect
          value={query.client}
          onChange={(v) => update('client', v)}
          placeholder={t('project.client')}
          options={clients.map((c) => ({ value: c.slug, label: c.name }))}
        />
        <FilterSelect
          value={query.tag}
          onChange={(v) => update('tag', v)}
          placeholder="tag"
          options={tags.map((tag) => ({ value: tag.slug, label: tag.name }))}
        />

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
                      <div className="font-medium">{project.name}</div>
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
                </>
              ),
            })}
          />
        }
      />
    </>
  )
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  const { t } = useT()
  return (
    <Select value={value || ALL} onValueChange={onChange}>
      <SelectTrigger className="w-[9.5rem]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>
          {t('common.all')} {placeholder.toLowerCase()}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
