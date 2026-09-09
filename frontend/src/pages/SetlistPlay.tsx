import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, ListPlus, Music, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Setlist, SetlistSong, Song } from '@/types'
import { cn } from '@/lib/utils'
import { transposeKey } from '@/lib/chords'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { ChordChart } from '@/components/ChordChart'
import { ErrorNote, Loading, PageHeader } from '@/components/bits'

/**
 * An evening, played through. The rail is the point: on stage the next song
 * has to be one tap away and always in the same place, so it sits down the
 * right on a wide screen and across the top on a phone, and never moves.
 *
 * A key changed here is remembered against this evening rather than against
 * the song, so "tonight in Bb" survives without rewriting what the song is.
 */
export default function SetlistPlay() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const ask = useConfirm()

  const [setlist, setSetlist] = useState<Setlist | null>(null)
  const [songs, setSongs] = useState<SetlistSong[] | null>(null)
  const [at, setAt] = useState(0)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!id) return
    api
      .setlist(Number(id))
      .then((data) => {
        setSetlist(data.setlist)
        setSongs(data.songs)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('setlist.failed')))
  }, [id, t])

  useEffect(load, [load])

  // Arrow keys, because a laptop on a stand is easier to nudge than to aim at,
  // and a page turner pedal sends exactly these.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        setAt((n) => Math.min((songs?.length ?? 1) - 1, n + 1))
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        setAt((n) => Math.max(0, n - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [songs])

  // A key change is worth keeping, but not worth a request per tap. It settles
  // on screen at once and reaches the server when the tapping stops.
  const pending = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  function setSteps(row: SetlistSong, steps: number) {
    setSongs((list) => (list ?? []).map((x) => (x.id === row.id ? { ...x, steps } : x)))
    clearTimeout(pending.current[row.id])
    pending.current[row.id] = setTimeout(() => {
      api.setSetlistSteps(row.id, steps).catch(() => toast.error(t('setlist.failed')))
    }, 600)
  }

  async function move(index: number, by: number) {
    const list = [...(songs ?? [])]
    const to = index + by
    if (to < 0 || to >= list.length) return
    ;[list[index], list[to]] = [list[to], list[index]]
    setSongs(list)
    if (at === index) setAt(to)
    else if (at === to) setAt(index)
    try {
      await api.reorderSetlist(Number(id), list.map((x) => x.id))
    } catch {
      toast.error(t('setlist.failed'))
      load()
    }
  }

  async function remove(row: SetlistSong, index: number) {
    if (!(await ask({ title: t('setlist.removeConfirm', { title: row.song.title }), danger: true })))
      return
    setSongs((list) => (list ?? []).filter((x) => x.id !== row.id))
    setAt((n) => (n >= index && n > 0 ? n - 1 : n))
    try {
      await api.removeSetlistSong(row.id)
    } catch {
      toast.error(t('setlist.failed'))
      load()
    }
  }

  // Making the record and putting it in the list are one action here: you
  // are building a running order, not filing a song. It opens the new one so
  // the chart can be typed straight away.
  async function createAndAdd(title: string) {
    try {
      const song = await api.createSong({
        title,
        artist: '',
        key: '',
        tempo: 0,
        part: '',
        body: '',
        notes: '',
      })
      await api.addSetlistSong(Number(id), song.id)
      const data = await api.setlist(Number(id))
      setSetlist(data.setlist)
      setSongs(data.songs)
      setAt(data.songs.length - 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setlist.failed'))
    }
  }

  async function add(song: Song) {
    try {
      await api.addSetlistSong(Number(id), song.id)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setlist.failed'))
    }
  }

  async function removeSetlist() {
    if (!setlist) return
    const ok = await ask({
      title: t('confirm.deleteTitle', { name: setlist.name }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: setlist.name }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    try {
      await api.deleteSetlist(Number(id))
      navigate('/setlists')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.deleteFailed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!setlist || songs === null) return <Loading />

  const current = songs[Math.min(at, songs.length - 1)]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/setlists"
        title={setlist.name}
        description={t('setlist.songCount', { n: songs.length })}
        action={
          <div className="flex gap-2">
            <Button variant={editing ? 'default' : 'outline'} onClick={() => setEditing(!editing)}>
              <Pencil className="size-4" />
              {editing ? t('setlist.arranged') : t('setlist.arrange')}
            </Button>
            {editing && (
              <Button variant="ghost" className="text-destructive" onClick={removeSetlist}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        }
      />

      {/* The rail is on top on a phone and down the right on a wide screen, so
          the chart's left edge never moves — that is where your eye already is. */}
      <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
        <aside className="lg:w-60 lg:shrink-0">
          <Card className="overflow-hidden py-0">
            <CardContent
              className={cn(
                'flex gap-1 overflow-x-auto p-2',
                'lg:flex-col lg:gap-0 lg:divide-y lg:overflow-visible lg:p-0',
              )}
            >
              {songs.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground">{t('setlist.noSongs')}</p>
              )}
              {songs.map((row, index) => (
                <div
                  key={row.id}
                  className={cn(
                    'flex shrink-0 items-center gap-1 lg:shrink',
                    index === at && 'bg-accent',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setAt(index)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          index === at && 'font-medium',
                        )}
                      >
                        {row.song.title}
                      </span>
                      {/* The key it will be played in, not the key it was
                          written in — that is what you are checking for. */}
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {transposeKey(row.song.key, row.steps, row.song.key.includes('b')) ||
                          t('song.noKey')}
                      </span>
                    </span>
                  </button>

                  {editing && (
                    <span className="flex shrink-0 items-center pr-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => move(index, -1)}
                        aria-label={t('setlist.moveUp')}
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => move(index, 1)}
                        aria-label={t('setlist.moveDown')}
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => remove(row, index)}
                        aria-label={t('setlist.remove')}
                      >
                        <X className="size-4" />
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {editing && <SongPicker onPick={add} onCreate={createAndAdd} />}
        </aside>

        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight">{current.song.title}</h2>
                  {current.song.artist && (
                    <p className="text-sm text-muted-foreground">{current.song.artist}</p>
                  )}
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link to={`/songs/${current.song.id}/edit`}>
                    <Pencil className="size-4" />
                    {t('setlist.editChart')}
                  </Link>
                </Button>
              </div>
              <ChordChart
                key={current.id}
                song={current.song}
                steps={current.steps}
                onSteps={(steps) => setSteps(current, steps)}
              />
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Music className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('setlist.addFirst')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// Adding to an evening is a search rather than a dropdown: a list of every
// song you know is unusable by the tenth one, and you already know the title.
function SongPicker({
  onPick,
  onCreate,
}: {
  onPick: (song: Song) => void
  onCreate: (title: string) => void
}) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Song[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .songs({ q: query })
        .then((data) => setFound(data.songs.slice(0, 8)))
        .catch(() => setFound([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  // A title that already exists is the one you meant to pick, not one to make
  // a second copy of.
  const exact = found.some((song) => song.title.toLowerCase() === typed.toLowerCase())

  return (
    <Card className="mt-3 py-0">
      <CardContent className="space-y-2 p-2">
        <div className="flex items-center gap-2 px-1 pt-1 text-xs text-muted-foreground">
          <ListPlus className="size-3.5" />
          {t('setlist.addSong')}
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('setlist.searchSong')}
        />
        <div className="divide-y">
          {found.map((song) => (
            <button
              key={song.id}
              type="button"
              onClick={() => onPick(song)}
              className="flex w-full items-center gap-2 px-1 py-2 text-left transition-colors hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{song.title}</span>
              {song.key && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{song.key}</span>
              )}
            </button>
          ))}
          {found.length === 0 && !typed && (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t('song.empty')}</p>
          )}
        </div>

        {/* A song you have not written down yet should not send you off to
            another page and back. This makes the record, drops it in at the
            end and opens it, so the chart can be typed where you are. */}
        {typed && !exact && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => onCreate(typed)}>
            <Plus className="size-4" />
            <span className="min-w-0 truncate">{t('setlist.createSong', { title: typed })}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
