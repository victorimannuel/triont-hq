import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronUp,
  GripVertical,
  ListPlus,
  Music,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Setlist, SetlistSong, Song } from '@/types'
import { cn } from '@/lib/utils'
import { transposeKey } from '@/lib/chords'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { BarEditor, parseChart, writeChart } from '@/components/BarEditor'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { ChordChart } from '@/components/ChordChart'
import { ErrorNote, Loading, PageHeader, Spinner } from '@/components/bits'

/**
 * An evening, played through. The rail is the point: on stage the next song
 * has to be one tap away and always in the same place, so it sits down the
 * right on a wide screen and across the top on a phone, and never moves.
 *
 * A key changed here is remembered against this evening rather than against
 * the song, so "tonight in Bb" survives without rewriting what the song is.
 */
/*
The characters a chord chart is written with.

A bar line with a space either side, because `|1 4|5` is unreadable and nobody
types the spaces by hand twice. The rest are what gets used inside a bar: a
repeat, a beat divider, and a held chord.
*/
const BARS = [
  { label: '|', insert: ' | ' },
  { label: '||', insert: ' || ' },
  { label: '%', insert: '%' },
  { label: '/', insert: '/' },
  { label: '-', insert: '-' },
] as const


export default function SetlistPlay() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const ask = useConfirm()

  const [setlist, setSetlist] = useState<Setlist | null>(null)
  const [songs, setSongs] = useState<SetlistSong[] | null>(null)
  const [at, setAt] = useState(0)
  const [editing, setEditing] = useState(false)
  // Which row is being dragged, while it is being dragged.
  const [dragging, setDragging] = useState<number | null>(null)
  /*
  The chart being typed, or null when one is not.

  It holds the song it belongs to, not just the text. The rail can change what
  is on screen while this is open, and a draft that only knew its own text
  would be saved against whatever happened to be showing.
  */
  const [draft, setDraft] = useState<{ songID: number; body: string } | null>(null)
  const chart = draft?.body ?? null
  const [saving, setSaving] = useState(false)
  // The grid is how a chart is written; the raw text is the way out for
  // anything it has no box for.
  const [raw, setRaw] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const [error, setError] = useState('')
  // The sideways rail on a phone, and the row that is open in it.
  const rail = useRef<HTMLDivElement>(null)
  const here = useRef<HTMLDivElement>(null)

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

  /*
  Dropping one song where another is, on a screen that has a pointer.

  The arrows stay: a phone has no drag worth the name, and two taps beats a
  long press and a wobble even where it does. Saved the same way either way —
  the list moves on screen first, the server is told after.
  */
  async function drop(to: number) {
    const from = dragging
    setDragging(null)
    if (from === null || from === to) return
    const list = [...(songs ?? [])]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setSongs(list)
    // Follow the song that was being looked at, wherever it ended up.
    const current = songs?.[at]
    if (current) setAt(list.findIndex((x) => x.id === current.id))
    try {
      await api.reorderSetlist(Number(id), list.map((x) => x.id))
    } catch {
      toast.error(t('setlist.failed'))
      load()
    }
  }

  /*
  Slide the open song to the left edge of the rail.

  The rail scrolls sideways on a phone, and tapping the second song leaves it
  where it was — halfway along, with the third still off the screen, so every
  song after it costs a tap and a swipe. Putting the open one at the left puts
  the next one in reach, which is the only move anybody makes here.

  Sideways only: on a wide screen the rail is a column, and a column does not
  need help.
  */
  useEffect(() => {
    const box = rail.current
    const row = here.current
    if (!box || !row || box.scrollWidth <= box.clientWidth) return
    box.scrollTo({ left: row.offsetLeft - box.offsetLeft, behavior: 'smooth' })
  }, [at, songs])

  /*
  Save the chart and go back to reading it.

  The song is sent whole because that is what the endpoint takes, so the copy
  held here is spread into the update — anything edited on the song's own page
  in the meantime would be a stale field otherwise, and this page reloads after
  saving for the same reason.
  */
  /*
  Put a character in at the caret and leave the caret after it.

  Setting the value through React alone would send the caret to the end of the
  text, which on the third bar of a line is worse than not having the button.
  So the selection is read before and written back after the box has been
  re-rendered with the new value.
  */
  function insert(text: string) {
    const el = box.current
    if (!el || !draft) return
    const from = el.selectionStart
    const to = el.selectionEnd
    setDraft({ ...draft, body: draft.body.slice(0, from) + text + draft.body.slice(to) })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(from + text.length, from + text.length)
    })
  }

  async function saveChart() {
    if (!draft) return
    // The song the draft was typed for, found by id rather than by what is on
    // screen — those are the same thing right up until they are not.
    const song = (songs ?? []).find((row) => row.song.id === draft.songID)?.song
    if (!song) {
      setDraft(null)
      return
    }
    setSaving(true)
    try {
      await api.updateSong(song.id, {
        title: song.title,
        artist: song.artist,
        key: song.key,
        tempo: song.tempo,
        part: song.part,
        body: draft.body,
        notes: song.notes,
        reference_url: song.reference_url ?? '',
      })
      setDraft(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('song.failed'))
    } finally {
      setSaving(false)
    }
  }

  /*
  Open another song, checking first that nothing is being thrown away.

  Untouched drafts close without a word — opening the editor and changing your
  mind is not a decision worth interrupting. Anything actually typed gets asked
  about, because the alternative is losing it to a mis-tap on a phone.
  */
  async function pick(index: number) {
    const song = songs?.[index]
    if (draft && song && song.song.id !== draft.songID) {
      const original =
        (songs ?? []).find((row) => row.song.id === draft.songID)?.song.body ?? ''
      if (draft.body !== original) {
        const ok = await ask({
          title: t('setlist.dropChart'),
          body: t('setlist.dropChartBody'),
          confirmLabel: t('setlist.dropChartYes'),
          danger: true,
        })
        if (!ok) return
      }
      setDraft(null)
    }
    setAt(index)
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
        reference_url: '',
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
              ref={rail}
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
                  ref={index === at ? here : undefined}
                  // Capped on a phone, where the rail scrolls sideways. Without
                  // a ceiling each item grows to whatever its title is, so one
                  // long song name pushes the rest of the set off the screen
                  // and the truncate below never gets a width to bite on.
                  draggable={editing}
                  onDragStart={() => setDragging(index)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => editing && event.preventDefault()}
                  onDrop={() => void drop(index)}
                  className={cn(
                    'flex max-w-36 shrink-0 items-center gap-1 lg:max-w-none lg:shrink',
                    index === at && 'bg-accent',
                    editing && 'cursor-grab active:cursor-grabbing',
                    dragging === index && 'opacity-40',
                  )}
                >
                  {/* The thing you actually drag.

                      A `draggable` row does nothing when the pointer goes down
                      on a button inside it: the button takes the press and the
                      drag never starts. So the handle is a plain span, and it
                      only exists while the order is being changed. */}
                  {editing && (
                    <span
                      draggable
                      onDragStart={() => setDragging(index)}
                      onDragEnd={() => setDragging(null)}
                      aria-hidden
                      className="grid shrink-0 cursor-grab place-items-center pl-1 text-muted-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void pick(index)}
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
                      {/* The rail runs sideways on a phone and downwards on a
                          wide screen, so an up arrow means "earlier" in one
                          layout and nothing at all in the other. Same button,
                          the arrow that matches what you are looking at. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => move(index, -1)}
                        aria-label={t('setlist.moveUp')}
                      >
                        <ChevronLeft className="size-4 lg:hidden" />
                        <ChevronUp className="hidden size-4 lg:block" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => move(index, 1)}
                        aria-label={t('setlist.moveDown')}
                      >
                        <ChevronRight className="size-4 lg:hidden" />
                        <ChevronDown className="hidden size-4 lg:block" />
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
                {/* The chart is typed here; everything else about the song
                    — its title, its key, the recording — is on its own page,
                    and that link says where to come back to. */}
                {chart === null ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft({ songID: current.song.id, body: current.song.body })}
                    >
                      <Pencil className="size-4" />
                      {t('setlist.editChart')}
                    </Button>
                    <Button asChild variant="ghost" size="icon" className="size-8">
                      <Link
                        to={`/songs/${current.song.id}/edit?from=/setlists/${id}`}
                        aria-label={t('song.edit')}
                        title={t('song.edit')}
                      >
                        <Settings2 className="size-4" />
                      </Link>
                    </Button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" disabled={saving} onClick={() => void saveChart()}>
                      {saving ? <Spinner /> : <Check className="size-4" />}
                      {t('common.save')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                      {t('common.cancel')}
                    </Button>
                  </span>
                )}
              </div>
              {chart !== null ? (
                <>
                  {/* The boxes are the editor. The text underneath is still
                      what gets stored, and this is the way to it when a chart
                      wants something the grid has no box for. */}
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant={raw ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRaw(!raw)}
                      aria-pressed={raw}
                    >
                      <Type className="size-4" />
                      {t('song.asText')}
                    </Button>
                    {raw &&
                      BARS.map((one) => (
                        <Button
                          key={one.label}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-10 font-mono"
                          onClick={() => insert(one.insert)}
                        >
                          {one.label}
                        </Button>
                      ))}
                  </div>

                  {raw ? (
                    /* Monospace, and nothing reformats it: the column a chord
                       sits in is what says which syllable it lands on. */
                    <Textarea
                      ref={box}
                      value={chart ?? ''}
                      autoFocus
                      onChange={(event) => setDraft({ ...draft!, body: event.target.value })}
                      placeholder={t('song.chartHint')}
                      spellCheck={false}
                      className="min-h-[60vh] font-mono text-sm"
                    />
                  ) : (
                    <BarEditor
                      rows={parseChart(chart ?? '')}
                      onRows={(rows) => setDraft({ ...draft!, body: writeChart(rows) })}
                    />
                  )}
                </>
              ) : (
              <ChordChart
                key={current.id}
                song={current.song}
                steps={current.steps}
                onSteps={(steps) => setSteps(current, steps)}
              />
              )}
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
