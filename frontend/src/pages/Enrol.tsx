import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, Fingerprint } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import { createCredential, deviceLabel, friendlyError, passkeysSupported } from '@/webauthn'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Logo } from '@/components/Logo'
import { ErrorNote, Field, Spinner } from '@/components/bits'

/**
 * Opened from a one-shot link, on a device that has never signed in here. The
 * token sits in the URL fragment, which the browser keeps to itself, so it
 * only ever reaches the server inside a request body we send deliberately.
 */
export default function Enrol({ menus }: { menus: ReactNode }) {
  const { t } = useT()
  const [token] = useState(() => window.location.hash.replace(/^#/, ''))
  const [name, setName] = useState('')
  const [device, setDevice] = useState('')
  const [supported, setSupported] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    passkeysSupported().then(setSupported)
    deviceLabel().then((label) => {
      setDevice(label)
      setName((current) => current || label)
    })
  }, [])

  async function enrol() {
    setBusy(true)
    setError('')
    try {
      const options = await api.enrolBegin(token)
      const credential = await createCredential(options)
      await api.enrolFinish(name.trim() || device || t('enrol.defaultName'), device, credential)
      setDone(true)
    } catch (err) {
      setError(friendlyError(err, t('security.addFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex justify-end gap-1 p-4">{menus}</div>

      <div className="flex flex-1 items-start justify-center px-4 pb-24 pt-8 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <Logo className="mb-2 size-9 text-primary" />
            <CardTitle className="text-xl lowercase">
              {done ? t('enrol.doneTitle') : t('enrol.title')}
            </CardTitle>
            <CardDescription>
              {done ? t('enrol.doneBody') : t('enrol.subtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {done ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <CheckCircle2 className="size-14 text-success" />
                <Button className="w-full" onClick={() => (window.location.href = '/')}>
                  {t('enrol.goSignIn')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {error && <ErrorNote>{error}</ErrorNote>}
                {!token && <ErrorNote>{t('enrol.noToken')}</ErrorNote>}
                {!supported && <ErrorNote>{t('security.unsupported')}</ErrorNote>}

                <Field label={t('security.deviceName')} htmlFor="enrol-name">
                  <Input
                    id="enrol-name"
                    value={name}
                    placeholder={t('security.namePlaceholder')}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <Button
                  className="w-full"
                  onClick={enrol}
                  disabled={busy || !token || !supported}
                >
                  {busy ? <Spinner /> : <Fingerprint className="size-4" />}
                  {busy ? t('security.enrolling') : t('enrol.action')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
