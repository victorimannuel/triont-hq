import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, Pencil, X } from 'lucide-react'

import { useT } from '@/i18n'
import { useReveal } from '@/lib/useReveal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/*
A stored secret, on the form that owns it.

It used to be an empty box with a note saying one was already saved. That
answers "can I change this" and refuses to answer "what is it" — so every time
the number was the thing actually wanted, the record had to be left and found
again in the list, which is the only place the eye lived.

Now the field shows what the list shows: dots, an eye, a copy button. The
plaintext is still only fetched when asked for and still puts itself away on
its own.

Replacing it is a separate act behind its own button. That is not ceremony: a
box that looks empty but silently overwrites a passport number on the next
keystroke is exactly the sort of thing worth one deliberate click.
*/
export function SecretField({
  id,
  has,
  value,
  onValue,
  fetcher,
  failMessage,
  inputID,
  autoComplete = 'off',
}: {
  /** The record the plaintext is fetched against. */
  id: number
  /** Whether anything is stored yet. A new record has nothing to reveal. */
  has: boolean
  /** The replacement being typed, empty when nothing is being replaced. */
  value: string
  onValue: (value: string) => void
  /** Asks the server for the plaintext. Memoise it, or the timer resets. */
  fetcher: (id: number) => Promise<string>
  failMessage: string
  inputID?: string
  autoComplete?: string
}) {
  const { t } = useT()
  const { shown, reveal, copy } = useReveal(fetcher, failMessage)
  // A record with nothing stored has nothing to look at, so it starts as the
  // plain box it always was.
  const [changing, setChanging] = useState(!has)

  /*
  The record is fetched after the first render, so on an existing document
  `has` is false for a frame and the state above starts wrong. Following it
  when it arrives is safe: nothing can have been typed that early, and `has`
  only ever turns on once. Pressing the pencil later is unaffected, because
  that does not change `has`.
  */
  useEffect(() => {
    if (has) setChanging(false)
  }, [has])

  if (changing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          id={inputID}
          type="password"
          autoComplete={autoComplete}
          className="font-mono text-xs"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          autoFocus={has}
        />
        {/* Only when there is something to go back to. */}
        {has && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              onValue('')
              setChanging(false)
            }}
            aria-label={t('common.cancel')}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    )
  }

  const open = shown[id] !== undefined

  return (
    <div className="flex items-center gap-1">
      <span className="flex h-9 flex-1 items-center truncate rounded-md border bg-muted/40 px-3 font-mono text-xs">
        {shown[id] ?? '••••••••'}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => reveal(id)}
        aria-label={t(open ? 'common.hide' : 'common.show')}
      >
        {open ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => copy(id, t('common.copied'), t('common.copyFailed'))}
        aria-label={t('common.copy')}
      >
        <Copy className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => setChanging(true)}
        aria-label={t('common.replace')}
      >
        <Pencil className="size-4" />
      </Button>
    </div>
  )
}
