import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Cake,
  FileText,
  FolderGit2,
  KeyRound,
  Package,
  Plus,
  Server,
  UserRound,
  Users,
  Receipt,
  Wallet,
} from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Overview as OverviewData } from '@/types'
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
import {
  ErrorNote,
  formatDate,
  formatMoney,
  Loading,
  PageHeader,
  RenewalBadge,
  StatusBadge,
} from '@/components/bits'

export default function Overview() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .overview()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />

  const totals = [
    { label: t('nav.projects'), value: data.total_projects, icon: FolderGit2, to: '/projects' },
    { label: t('nav.clients'), value: data.total_clients, icon: Users, to: '/clients' },
    { label: t('nav.assets'), value: data.total_assets, icon: Server, to: '/assets' },
    { label: t('nav.credentials'), value: data.total_credentials, icon: KeyRound, to: '/credentials' },
    { label: t('nav.documents'), value: data.total_documents, icon: FileText, to: '/documents' },
    { label: t('nav.belongings'), value: data.total_belongings, icon: Package, to: '/belongings' },
    { label: t('nav.people'), value: data.total_people, icon: UserRound, to: '/people' },
    { label: t('nav.income'), value: data.total_income, icon: Wallet, to: '/income' },
    { label: t('nav.expenses'), value: data.total_expenses, icon: Receipt, to: '/expenses' },
  ]

  return (
    <>
      <PageHeader
        title={t('home.title')}
        description={t('home.links', { n: data.total_links })}
        action={
          <Button asChild>
            <Link to="/projects/new">
              <Plus className="size-4" />
              {t('project.new')}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
        {totals.map((item) => (
          <Link key={item.label} to={item.to}>
            <Card className="gap-0 p-3 transition-colors hover:bg-accent">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <item.icon className="size-3.5" />
                {item.label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{item.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {meta.statuses.map((status) => (
          <Link
            key={status.value}
            to={`/projects?status=${status.value}`}
            className="flex items-baseline justify-between rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <span className="text-xs text-muted-foreground">{status.label}</span>
            <span className="text-lg font-semibold tabular-nums">
              {data.status_counts[status.value] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      {data.birthdays.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
            {t('home.birthdays')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{t('home.birthdaysHint')}</span>
          </h2>
          <Card className="divide-y py-0">
            {data.birthdays.map((person) => (
              <Link
                key={person.id}
                to={`/people/${person.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
              >
                <Cake className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 font-medium">{person.name}</span>
                <span className="text-sm text-muted-foreground">
                  {person.birthday ? formatDate(person.birthday) : ''}
                </span>
              </Link>
            ))}
          </Card>
        </>
      )}

      {data.expiring.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
            {t('home.expiring')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('home.expiringHint')}
            </span>
          </h2>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nav.documents')}</TableHead>
                  <TableHead>{t('doc.holder')}</TableHead>
                  <TableHead>{t('doc.expires')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.expiring.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <Link to={`/documents/${doc.id}`} className="hover:underline">
                        {doc.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.holder || '—'}</TableCell>
                    <TableCell>
                      <RenewalBadge renewsOn={doc.expires_on} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {data.renewals.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
            {t('home.renewals')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('home.renewalsHint')}
            </span>
          </h2>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nav.assets')}</TableHead>
                  <TableHead>{t('asset.provider')}</TableHead>
                  <TableHead>{t('asset.cost')}</TableHead>
                  <TableHead>{t('asset.renewal')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.renewals.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">
                      <Link to={`/assets/${asset.id}`} className="hover:underline">
                        {asset.name}
                      </Link>
                      {asset.auto_renew && (
                        <span className="ml-2 text-xs text-muted-foreground">{t('asset.autoRenew')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {asset.provider || '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(asset.cost_amount, asset.cost_currency)}
                    </TableCell>
                    <TableCell>
                      <RenewalBadge renewsOn={asset.renews_on} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">{t('home.recent')}</h2>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('nav.projects')}</TableHead>
              <TableHead>{t('project.client')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('link.title')}</TableHead>
              <TableHead className="text-right">{t('nav.credentials')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent.map((project) => (
              <TableRow
                key={project.id}
                onClick={() => navigate(`/projects/${project.slug}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/projects/${project.slug}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{project.client || '—'}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={project.status}
                    label={
                      tOpt('status', project.status)
                    }
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {project.link_count}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {project.credential_count}
                </TableCell>
              </TableRow>
            ))}
            {data.recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t('home.empty')}{' '}
                  <Link to="/projects/new" className="text-primary hover:underline">
                    {t('home.addOne')}
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
