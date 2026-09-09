import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ListMusic, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Setlist } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErrorNote, formatDate, Loading, PageHeader } from '@/components/bits'

/**
 * The evenings. Making one is a name and a date and nothing else — the songs
 * go in on the setlist's own page, where you can see what you are building.
 */
export default function Setlists() {
  const { t } = useT()
  const [setlists, setSetlists] = useState<Setlist[] | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [playsOn, setPlaysOn] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  function load() {
    api
      .setlists()
      .then((data) => {
        setSetlists(data.setlists)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('setlist.failed')))
  }

  useEffect(load, [])

  // A button that is simply dead reads as broken. Pressing it with nothing
  // typed says what is missing and puts the cursor there.
  async function create(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (busy) return
    if (!trimmed) {
      toast.error(t('setlist.nameRequired'))
      box.current?.focus()
      return
    }
    setBusy(true)
    try {
      await api.createSetlist({ name: trimmed, plays_on: playsOn, notes: '' })
      setName('')
      setPlaysOn('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setlist.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('setlist.title')} description={t('setlist.subtitle')} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={create}>
        <Input
          ref={box}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('setlist.namePlaceholder')}
          className="min-w-40 flex-1"
        />
        <Input
          type="date"
          value={playsOn}
          onChange={(event) => setPlaysOn(event.target.value)}
          className="w-40"
        />
        <Button type="submit" disabled={busy}>
          <Plus className="size-4" />
          {t('setlist.new')}
        </Button>
      </form>

      {setlists === null ? (
        <Loading />
      ) : setlists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ListMusic className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('setlist.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="divide-y px-0">
            {setlists.map((list) => (
              <Link
                key={list.id}
                to={`/setlists/${list.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{list.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t('setlist.songCount', { n: list.song_count })}
                  </p>
                </div>
                {list.plays_on && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(list.plays_on)}
                  </span>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
