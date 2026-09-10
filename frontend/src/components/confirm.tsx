import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

import { useT } from '@/i18n'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { Stepper } from '@/components/bits'
import { cn } from '@/lib/utils'

export type ConfirmOptions = {
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** Ask twice. For anything that destroys or resurrects a record. */
  double?: boolean
  doubleTitle?: string
  doubleBody?: ReactNode
  doubleLabel?: string
  /*
  One number to type before confirming, for a question that is really "how
  many" rather than "are you sure". The answer comes back through onValue
  rather than through the promise, so every other caller keeps its plain
  boolean and its `if (!ok) return`.
  */
  input?: {
    label: string
    initial?: string
    onValue: (value: string) => void
  }
}

type Ask = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask>(async () => false)

export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [typed, setTyped] = useState('')
  const resolver = useRef<((value: boolean) => void) | null>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  const ask = useCallback<Ask>((next) => {
    setOptions(next)
    setStep(1)
    setTyped(next.input?.initial ?? '')
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function settle(value: boolean) {
    setOptions(null)
    setStep(1)
    resolver.current?.(value)
    resolver.current = null
  }

  function accept() {
    // A high-risk action asks a second time, in blunter words, rather than
    // relying on the first click having been deliberate.
    if (options?.double && step === 1) {
      setStep(2)
      return
    }
    options?.input?.onValue(typed)
    settle(true)
  }

  const second = step === 2
  const title = second ? (options?.doubleTitle ?? options?.title) : options?.title
  const body = second ? (options?.doubleBody ?? options?.body) : options?.body
  const label = second
    ? (options?.doubleLabel ?? t('confirm.sure'))
    : (options?.confirmLabel ?? t('confirm.yes'))

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        {/* A question with a number in it lands on its confirm button rather
            than on Cancel, so enter says yes and the phone keyboard stays down.
            Focusing the box would be the obvious move and is the wrong one: it
            throws a keyboard over half the screen for a number that is two taps
            away, and the box is still there to tap when it really is fourteen. */}
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            if (!options?.input) return
            event.preventDefault()
            confirmButton.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="lowercase">{title}</AlertDialogTitle>
            {body && <AlertDialogDescription asChild><div>{body}</div></AlertDialogDescription>}
          </AlertDialogHeader>
          {options?.input && (
            <Stepper
              value={typed}
              onValue={setTyped}
              label={options.input.label}
              caption={options.input.label}
              // Enter still saves for anyone who did tap in to type.
              onEnter={accept}
            />
          )}
          {/* Step two swaps the buttons around. A second click landing on the
              same spot would otherwise sail straight through both stages. The
              phone needs its own swap: there the footer stacks rather than sits
              in a row, so reversing the row alone would change nothing. */}
          {/* On a phone the two buttons split the row so neither is a small
              target hugging one edge; from sm up the dialog is wide enough for
              them to sit at their natural size. */}
          <AlertDialogFooter
            className={cn(
              'flex-row justify-end [&>*]:flex-1 sm:[&>*]:flex-initial',
              second && 'flex-row-reverse justify-start',
            )}
          >
            <AlertDialogCancel onClick={() => settle(false)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              ref={confirmButton}
              onClick={(event) => {
                // Stage one must not close the dialog; it swaps the copy.
                if (options?.double && step === 1) event.preventDefault()
                accept()
              }}
              className={cn(
                options?.danger &&
                  buttonVariants({ variant: 'destructive' }),
              )}
            >
              {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
