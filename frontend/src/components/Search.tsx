import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog as DialogPrimitive,
} from 'radix-ui'
import {
  CalendarDays,
  FileText,
  FolderGit2,
  KeyRound,
  Link2,
  Package,
  Receipt,
  Search as SearchIcon,
  Server,
  Tag as TagIcon,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Hit } from '@/types'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/bits'

const ICONS: Record<string, typeof FolderGit2> = {
  project: FolderGit2,
  link: Link2,
  credential: KeyRound,
  client: Users,
  contact: Users,
  asset: Server,
  document: FileText,
  belonging: Package,
  maintenance: Wrench,
  person: UserRound,
  income: Wallet,
  expense: Receipt,
  tag: TagIcon,
  calendar: CalendarDays,
}

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Every keystroke would be a round trip; a short pause is enough to feel
  // instant while sparing the database most of them.
  useEffect(() => {
    if (!open) return
    const term = query.trim()
    if (!term) {
      setHits([])
      setBusy(false)
      return
    }
    setBusy(true)
    const timer = setTimeout(() => {
      api
        .search(term)
        .then((data) => {
          setHits(data.hits)
          setCursor(0)
        })
        .catch(() => setHits([]))
        .finally(() => setBusy(false))
    }, 160)
    return () => clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setCursor(0)
    }
  }, [open])

  const go = useCallback(
    (hit: Hit) => {
      onOpenChange(false)
      navigate(hit.url)
    },
    [navigate, onOpenChange],
  )

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => Math.min(c + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (event.key === 'Enter' && hits[cursor]) {
      event.preventDefault()
      go(hits[cursor])
    }
  }

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, hits])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-4 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:top-[12vh]"
        >
          <DialogPrimitive.Title className="sr-only">{t('search.title')}</DialogPrimitive.Title>

          <div className="flex items-center gap-3 border-b px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {busy && <Spinner className="text-muted-foreground" />}
          </div>

          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
            {hits.map((hit, index) => {
              const Icon = ICONS[hit.entity] ?? FolderGit2
              return (
                <button
                  key={`${hit.entity}-${hit.id}-${index}`}
                  type="button"
                  data-active={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(hit)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                    index === cursor ? 'bg-secondary' : 'hover:bg-secondary/60',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{hit.title}</span>
                    {(hit.subtitle || hit.detail) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[hit.subtitle, hit.detail].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(`search.entity.${hit.entity}`)}
                  </span>
                </button>
              )
            })}

            {!busy && query.trim() && hits.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('search.none', { query: query.trim() })}
              </p>
            )}
            {!query.trim() && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('search.hint')}
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Ctrl+K / Cmd+K from anywhere, and "/" when you are not typing in a field. */
export function useSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.isContentEditable)

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpen()
      } else if (event.key === '/' && !typing) {
        event.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpen])
}
