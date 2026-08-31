import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Fingerprint,
  Link2,
  Pencil,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Passkey } from '@/types'
import {
  createCredential,
  deviceLabel,
  friendlyError,
  getCredential,
  passkeysSupported,
} from '@/webauthn'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { PushSection } from '@/components/PushSection'
import {
  ErrorNote,
  Field,
  formatDate,
  Loading,
  PageHeader,
  SectionTitle,
  Spinner,
} from '@/components/bits'

export default function Security() {
  const { t } = useT()
  const confirm = useConfirm()
  const [keys, setKeys] = useState<Passkey[] | null>(null)
  const [supported, setSupported] = useState(true)
  const [name, setName] = useState('')
  const [device, setDevice] = useState('')
  const [busy, setBusy] = useState<'' | 'this' | 'other' | 'link'>('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .passkeys()
      .then((data) => setKeys(data.passkeys))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])
  useEffect(() => {
    passkeysSupported().then(setSupported)
    // The name field starts as whatever this machine calls itself, which beats
    // a list of entries all called "this device".
    deviceLabel().then((label) => {
      setDevice(label)
      setName((current) => current || label)
    })
  }, [])

  async function enrol(mode?: 'other') {
    setBusy(mode ? 'other' : 'this')
    setError('')
    try {
      const options = await api.passkeyEnrolBegin(mode)
      const credential = await createCredential(options)
      await api.passkeyEnrolFinish(name.trim() || device, device, credential)
      load()
      toast.success(t('security.added'))
    } catch (err) {
      setError(friendlyError(err, t('security.addFailed')))
    } finally {
      setBusy('')
    }
  }

  async function makeLink() {
    setBusy('link')
    setError('')
    setCopied(false)
    setLink('')
    try {
      // The link is a way in, so an open session alone does not earn one —
      // confirm on this device first.
      if (keys?.length) {
        const options = await api.stepUpBegin()
        const credential = await getCredential(options)
        const here =
          credential.authenticatorAttachment === 'platform' ? await deviceLabel() : ''
        await api.stepUpFinish(credential, here)
      }
      const { url } = await api.enrolLink()
      setLink(url)
    } catch (err) {
      setError(friendlyError(err, t('security.linkFailed')))
    } finally {
      setBusy('')
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Clipboard access can be refused; the link is on screen to read anyway.
      toast.error(t('security.copyFailed'))
    }
  }

  async function rename(key: Passkey) {
    const name = draft.trim()
    setEditing(null)
    if (!name || name === key.name) return
    try {
      await api.renamePasskey(key.id, name)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('security.renameFailed'))
    }
  }

  async function remove(key: Passkey) {
    const ok = await confirm({
      title: t('security.removeTitle', { name: key.name }),
      body: t('security.removeBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return

    try {
      // Removing a device is how two-step gets switched off, so it costs the
      // same fresh proof as handing out an enrolment link. Asked after the
      // dialog, so a cancelled removal never raises a biometric prompt.
      const options = await api.stepUpBegin()
      const credential = await getCredential(options)
      const here =
        credential.authenticatorAttachment === 'platform' ? await deviceLabel() : ''
      await api.stepUpFinish(credential, here)

      await api.deletePasskey(key.id)
      load()
      toast.success(t('security.removed'))
    } catch (err) {
      toast.error(friendlyError(err, t('security.removeFailed')))
    }
  }

  if (!keys) return <Loading />

  return (
    <div>
      <PageHeader title={t('security.title')} description={t('security.subtitle')} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <SectionTitle>{t('security.devices')}</SectionTitle>

      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className={keys.length ? 'mt-0.5 size-5 text-success' : 'mt-0.5 size-5 text-warning'}
            />
            <p className="text-sm text-muted-foreground">
              {keys.length ? t('security.onState') : t('security.offState')}
            </p>
          </div>

          {!supported && <ErrorNote>{t('security.unsupported')}</ErrorNote>}

          <p className="text-xs text-muted-foreground">{t('security.otherHint')}</p>

          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('security.deviceName')} htmlFor="passkey-name">
              <Input
                id="passkey-name"
                value={name}
                placeholder={t('security.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                className="sm:w-64"
              />
            </Field>
            <Button onClick={() => enrol()} disabled={!!busy || !supported}>
              {busy === 'this' ? <Spinner /> : <Fingerprint className="size-4" />}
              {busy === 'this' ? t('security.enrolling') : t('security.enrol')}
            </Button>
            <Button variant="outline" onClick={() => enrol('other')} disabled={!!busy}>
              {busy === 'other' ? <Spinner /> : <Smartphone className="size-4" />}
              {busy === 'other' ? t('security.enrolling') : t('security.enrolOther')}
            </Button>
            <Button variant="outline" onClick={makeLink} disabled={!!busy}>
              {busy === 'link' ? <Spinner /> : <Link2 className="size-4" />}
              {busy === 'link' ? t('security.verifying') : t('security.linkButton')}
            </Button>
          </div>

          {link && (
            <div className="space-y-3 rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs text-muted-foreground">{t('security.linkHint')}</p>

              {/* Always black on white: a QR inverted for a dark theme is a
                  coin flip on whether the camera reads it. */}
              <div className="flex justify-center">
                <div className="rounded-md bg-white p-3">
                  <QRCodeSVG value={link} size={176} level="M" marginSize={0} />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {t('security.linkScan')}
              </p>

              <div className="flex gap-2">
                <Input readOnly value={link} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('security.empty')}</p>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <Card key={key.id}>
              <CardContent className="flex items-center gap-4">
                <Fingerprint className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {editing === key.id ? (
                    <div className="flex gap-2 pb-1">
                      <Input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename(key)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                      <Button variant="outline" size="icon" onClick={() => void rename(key)}>
                        <Check className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex max-w-full items-center gap-1.5 text-left font-medium hover:text-primary"
                      onClick={() => {
                        setDraft(key.name)
                        setEditing(key.id)
                      }}
                    >
                      <span className="truncate">{key.name}</span>
                      <Pencil className="size-3 shrink-0 opacity-50" />
                    </button>
                  )}
                  {key.device && key.device !== key.name && (
                    <p className="truncate text-xs text-muted-foreground">{key.device}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('security.addedOn', { date: formatDate(key.created_at) })}
                    {key.location && ` · ${key.location}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {key.last_used_at
                      ? t('security.lastUsed', { date: formatDate(key.last_used_at) })
                      : t('security.neverUsed')}
                    {key.last_used_location && ` · ${key.last_used_location}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(key)}>
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mb-8 mt-6 text-xs text-muted-foreground">{t('security.lockoutNote')}</p>

      <PushSection />
    </div>
  )
}
