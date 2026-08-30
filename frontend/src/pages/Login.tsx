import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Fingerprint } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import { deviceLabel, friendlyError, getCredential } from '@/webauthn'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Logo } from '@/components/Logo'
import { ErrorNote, Field, Spinner } from '@/components/bits'

export default function Login({
  onDone,
  menus,
}: {
  onDone: (session: { email: string }) => void
  menus: ReactNode
}) {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The password is only the first half once a passkey is registered.
  const [step, setStep] = useState<'password' | 'passkey'>('password')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const session = await api.login(email, password)
      if (session.step === 'passkey') {
        setStep('passkey')
        return
      }
      onDone(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'))
    } finally {
      setBusy(false)
    }
  }

  const verify = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const options = await api.passkeyLoginBegin()
      const credential = await getCredential(options)
      // Only a key living on this machine says anything about this machine; one
      // borrowed from a phone over the QR would name the wrong device.
      const here =
        credential.authenticatorAttachment === 'platform' ? await deviceLabel() : ''
      onDone(await api.passkeyLoginFinish(credential, here))
    } catch (err) {
      setError(friendlyError(err, t('login.passkeyFailed')))
    } finally {
      setBusy(false)
    }
  }, [onDone, t])

  // Windows Hello and the phone's sensor both pop straight up, so the second
  // step usually needs no click at all. If the browser refuses without a fresh
  // gesture the button below is still there.
  useEffect(() => {
    if (step === 'passkey') void verify()
  }, [step, verify])

  function back() {
    setStep('password')
    setPassword('')
    setError('')
  }

  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex justify-end gap-1 p-4">{menus}</div>

      <div className="flex flex-1 items-start justify-center px-4 pb-24 pt-8 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <Logo className="mb-2 size-9 text-primary" />
            <CardTitle className="text-xl lowercase">
              {step === 'password' ? t('login.title') : t('login.verifyTitle')}
            </CardTitle>
            <CardDescription>
              {step === 'password' ? t('login.subtitle') : t('login.verifySubtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && <ErrorNote>{error}</ErrorNote>}

            {step === 'password' ? (
              <form className="space-y-4" onSubmit={submit}>
                <Field label={t('login.email')} htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </Field>

                <Field label={t('login.password')} htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Spinner />}
                  {busy ? t('common.saving') : t('login.title')}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center py-4">
                  <Fingerprint
                    className={`size-14 text-primary ${busy ? 'animate-pulse' : ''}`}
                  />
                </div>

                <Button className="w-full" onClick={verify} disabled={busy}>
                  {busy ? <Spinner /> : <Fingerprint className="size-4" />}
                  {busy ? t('login.verifying') : t('login.verifyNow')}
                </Button>

                <Button variant="ghost" className="w-full" onClick={back} disabled={busy}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
