import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, ExternalLink, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type {
  Asset,
  Client,
  Link as LinkRow,
  LinkInput,
  Project,
  ProjectInput,
} from '@/types'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useConfirm } from '@/components/confirm'
import {
  AuditInfo,
  ErrorNote,
  Field,
  Loading,
  NameInput,
  Spinner,
  StatusBadge,
} from '@/components/bits'
import { Files } from '@/components/Files'

const NONE = '__none__'

function toInput(p: Project): ProjectInput {
  return {
    name: p.name,
    client_id: p.client_id,
    status: p.status,
    kind: p.kind,
    summary: p.summary,
    local_path: p.local_path,
    deploy_target: p.deploy_target,
    notes: p.notes,
  }
}

export default function ProjectDetail() {
  const { slug = '' } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()

  const [project, setProject] = useState<Project | null>(null)
  const [form, setForm] = useState<ProjectInput | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<LinkInput>({
    label: '',
    url: '',
    category: 'repo',
    notes: '',
  })
  const [editingLink, setEditingLink] = useState<number | null>(null)
  const [linkDraft, setLinkDraft] = useState<LinkInput>(draft)
  const [assetOptions, setAssetOptions] = useState<Asset[]>([])
  const [clientOptions, setClientOptions] = useState<Client[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [attachDraft, setAttachDraft] = useState({ assetId: '', role: '' })

  const load = useCallback(() => {
    api
      .project(slug)
      .then((p) => {
        setProject(p)
        setForm(toInput(p))
      })
      .catch((err) => setError(err.message))
  }, [slug])

  useEffect(load, [load])

  useEffect(() => {
    api
      .assets({})
      .then((data) => setAssetOptions(data.assets))
      .catch(() => undefined)
    api
      .clients()
      .then((data) => setClientOptions(data.clients))
      .catch(() => undefined)
  }, [])

  async function attachAsset(event: FormEvent) {
    event.preventDefault()
    if (!attachDraft.assetId) return
    try {
      await api.attachAsset(slug, Number(attachDraft.assetId), attachDraft.role)
      setAttachDraft({ assetId: '', role: '' })
      toast.success('Aset ditempelkan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal menempelkan aset')
    }
  }

  async function addTag(event: FormEvent) {
    event.preventDefault()
    const name = tagDraft.trim()
    if (!name) return
    try {
      await api.tagProject(slug, name)
      setTagDraft('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal nambah tag')
    }
  }

  async function removeTag(tagId: number) {
    await api.untagProject(slug, tagId).catch(() => undefined)
    load()
  }

  async function detachAsset(assetId: number) {
    if (!(await confirm({ title: t('confirm.detachTitle', { name: 'aset' }), body: t('confirm.detachBody') })))
      return
    await api.detachAsset(slug, assetId).catch(() => undefined)
    toast.success('Aset dilepas')
    load()
  }

  // The save bar only shows up once something actually differs from what is
  // stored, so the page reads as a view until you start typing in it.
  const dirty = useMemo(
    () => Boolean(project && form && JSON.stringify(toInput(project)) !== JSON.stringify(form)),
    [project, form],
  )

  function set<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      const saved = await api.updateProject(slug, form)
      setProject(saved)
      setForm(toInput(saved))
      toast.success('Project disimpan')
      // The slug follows the name, so keep the URL honest.
      if (saved.slug !== slug) navigate(`/projects/${saved.slug}`, { replace: true })
      else load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  async function addLink(event: FormEvent) {
    event.preventDefault()
    try {
      await api.createLink(slug, draft)
      setDraft({ label: '', url: '', category: draft.category, notes: '' })
      toast.success('Link ditambahkan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal nambah link')
    }
  }

  function startEditLink(link: LinkRow) {
    setEditingLink(link.id)
    setLinkDraft({
      label: link.label,
      url: link.url,
      category: link.category,
      notes: link.notes,
    })
  }

  async function saveLink() {
    if (editingLink === null) return
    try {
      await api.updateLink(editingLink, linkDraft)
      setEditingLink(null)
      toast.success('Link disimpan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal menyimpan link')
    }
  }

  async function removeLink(id: number) {
    if (!(await confirm({ title: t('confirm.removeLinkTitle'), danger: true }))) return
    await api.deleteLink(id).catch(() => undefined)
    if (editingLink === id) setEditingLink(null)
    toast.success('Link dihapus')
    load()
  }

  async function removeProject() {
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: project?.name ?? '' }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: project?.name ?? '' }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    await api.deleteProject(slug)
    toast.success('Project dihapus')
    navigate('/projects')
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!project || !form) return <Loading />

  const statusLabel = meta.statuses.find((s) => s.value === form.status)?.label ?? form.status
  const kindLabel = meta.kinds.find((k) => k.value === form.kind)?.label ?? form.kind

  return (
    <>
      {dirty && (
        <div className="sticky top-14 z-30 md:top-0 -mx-4 mb-6 flex items-center gap-3 border-b bg-popover/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm text-muted-foreground">Ada perubahan yang belum disimpan.</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setForm(toInput(project))}>
              <RotateCcw className="size-4" />
              Batal
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Spinner />}
              Simpan
            </Button>
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{form.name || 'Tanpa nama'}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={form.status} label={statusLabel} />
            <Badge variant="secondary">{kindLabel}</Badge>
            {project.client_slug && (
              <Link to={`/clients/${project.client_slug}`}>
                <Badge variant="outline" className="hover:bg-accent">
                  {project.client}
                </Badge>
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(project.tags ?? []).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 py-0.5 pl-2.5 pr-1 text-xs"
              >
                <Link to={`/projects?tag=${tag.slug}`} className="hover:underline">
                  {tag.name}
                </Link>
                <button
                  type="button"
                  onClick={() => removeTag(tag.id)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Lepas tag ${tag.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <form onSubmit={addTag}>
              <Input
                className="h-7 w-32 rounded-full px-3 text-xs"
                placeholder="+ tag"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
              />
            </form>
          </div>
        </div>

        <Button variant="ghost" className="text-destructive" onClick={removeProject}>
          <Trash2 className="size-4" />
          Hapus
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <Field label="Nama" htmlFor="name">
            <NameInput
              id="name"
              value={form.name}
              onValue={(v) => set('name', v)}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Klien">
              <Select
                value={form.client_id ? String(form.client_id) : NONE}
                onValueChange={(v) => set('client_id', v === NONE ? null : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>(tanpa klien)</SelectItem>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Jenis">
              <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.kinds.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.statuses.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Deploy" htmlFor="deploy" hint="— container, role ansible, server">
              <Input
                id="deploy"
                className="font-mono text-xs"
                value={form.deploy_target}
                onChange={(e) => set('deploy_target', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Folder lokal" htmlFor="path">
            <Input
              id="path"
              className="font-mono text-xs"
              value={form.local_path}
              onChange={(e) => set('local_path', e.target.value)}
            />
          </Field>

          <Field label="Catatan" htmlFor="notes">
            <Textarea
              id="notes"
              rows={5}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>

          <AuditInfo
            createdBy={project.created_by}
            createdAt={project.created_at}
            updatedBy={project.updated_by}
            updatedAt={project.updated_at}
          />
        </CardContent>
      </Card>

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Ditumpangkan di</h2>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aset</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Penanda</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(project.assets ?? []).map((usage) => (
              <TableRow key={usage.asset_id}>
                <TableCell className="font-medium">
                  <Link to={`/assets/${usage.asset_id}`} className="hover:underline">
                    {usage.asset_name}
                  </Link>
                  {usage.provider && (
                    <div className="text-xs text-muted-foreground">{usage.provider}</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {meta.asset_kinds.find((k) => k.value === usage.asset_kind)?.label ??
                    usage.asset_kind}
                </TableCell>
                <TableCell className="font-mono text-xs">{usage.identifier || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{usage.role || '—'}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => detachAsset(usage.asset_id)}
                    aria-label="Lepas aset"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(project.assets ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Belum ditempel ke aset mana pun.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={attachAsset}>
        <Select
          value={attachDraft.assetId}
          onValueChange={(v) => setAttachDraft({ ...attachDraft, assetId: v })}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Pilih aset" />
          </SelectTrigger>
          <SelectContent>
            {assetOptions.map((asset) => (
              <SelectItem key={asset.id} value={String(asset.id)}>
                {asset.name}
                {asset.identifier ? ` · ${asset.identifier}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-48"
          placeholder="Peran (web, db, domain…)"
          value={attachDraft.role}
          onChange={(e) => setAttachDraft({ ...attachDraft, role: e.target.value })}
        />
        <Button type="submit" disabled={!attachDraft.assetId}>
          <Plus className="size-4" />
          Tempelkan
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/assets/new">Bikin aset baru</Link>
        </Button>
      </form>

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Link</h2>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(project.links ?? []).map((link) =>
              editingLink === link.id ? (
                <TableRow key={link.id}>
                  <TableCell>
                    <Input
                      value={linkDraft.label}
                      onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })}
                      placeholder="Label"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={linkDraft.category}
                      onValueChange={(v) => setLinkDraft({ ...linkDraft, category: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meta.link_categories.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="font-mono text-xs"
                      value={linkDraft.url}
                      onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                      placeholder="https://…"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={saveLink} aria-label="Simpan">
                        <Check className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground"
                        onClick={() => setEditingLink(null)}
                        aria-label="Batal"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {meta.link_categories.find((c) => c.value === link.category)?.label ??
                      link.category}
                  </TableCell>
                  <TableCell>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all font-mono text-xs text-primary hover:underline"
                    >
                      {link.url}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground"
                        onClick={() => startEditLink(link)}
                        aria-label="Ubah link"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeLink(link.id)}
                        aria-label="Hapus link"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
            {(project.links ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Belum ada link.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={addLink}>
        <Input
          className="w-40"
          placeholder="Label"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <Select
          value={draft.category}
          onValueChange={(value) => setDraft({ ...draft, category: value })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meta.link_categories.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-[16rem] flex-1"
          placeholder="https://…"
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          required
        />
        <Button type="submit">
          <Plus className="size-4" />
          Tambah
        </Button>
      </form>

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Credential</h2>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Host</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(project.credentials ?? []).map((credential) => (
              <TableRow
                key={credential.id}
                onClick={() => navigate(`/credentials/${credential.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">{credential.label}</TableCell>
                <TableCell className="text-muted-foreground">
                  {meta.credential_kinds.find((k) => k.value === credential.kind)?.label ??
                    credential.kind}
                </TableCell>
                <TableCell className="font-mono text-xs">{credential.username || '—'}</TableCell>
                <TableCell className="font-mono text-xs">{credential.host || '—'}</TableCell>
              </TableRow>
            ))}
            {(project.credentials ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Belum ada credential.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-3">
        <Button variant="outline" asChild>
          <Link to={`/credentials/new?project=${project.id}`}>
            <Plus className="size-4" />
            Tambah credential
          </Link>
        </Button>
      </div>

      <Files entity="project" id={project.id} />
    </>
  )
}
