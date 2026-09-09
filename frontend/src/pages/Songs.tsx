import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Music, Plus, Search } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Song } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErrorNote, Loading, PageHeader, Segmented } from '@/components/bits'

/**
 * The songs you can play. Deliberately a plain list: it gets opened on a phone
 * a minute before the first song, so what matters is finding the right one
 * fast, not looking at anything.
 */

const PARTS = [
  { value: '', label: 'semua' },
  { value: 'bass', label: 'bass' },
  { value: 'piano', label: 'piano' },
] as const

export default function Songs() {
  const { t } = useT()
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [query, setQuery] = useState('')
  const [part, setPart] = useState<'' | 'bass' | 'piano'>('')
  const [error, setError] = useState('')

  useEffect(() => {
    // Typing is meant to narrow as you go, so the request waits for a pause
    // rather than firing on every letter.
    const timer = setTimeout(() => {
      api
        .songs({ q: query, part })
        .then((data) => {
          setSongs(data.songs)
          setError('')
        })
        .catch((err) => setError(err instanceof Error ? err.message : t('song.failed')))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, part, t])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('song.title')}
        description={t('song.subtitle')}
        action={
          <Button asChild>
            <Link to="/songs/new">
              <Plus className="size-4" />
              {t('song.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('song.search')}
            className="pl-9"
          />
        </div>
        <Segmented value={part} onChange={setPart} options={PARTS} />
      </div>

      {songs === null ? (
        <Loading />
      ) : songs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Music className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('song.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="divide-y px-0">
            {songs.map((song) => (
              <Link
                key={song.id}
                to={`/songs/${song.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  {song.artist && (
                    <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                  )}
                </div>
                {song.key && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {song.key}
                  </span>
                )}
                {song.tempo > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('song.bpm', { n: song.tempo })}
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
