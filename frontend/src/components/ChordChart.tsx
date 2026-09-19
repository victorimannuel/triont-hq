import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AArrowDown, AArrowUp, AudioLines, Minus, Play, Plus, RotateCcw } from 'lucide-react'

import { useT } from '@/i18n'
import type { Song } from '@/types'
import { cn } from '@/lib/utils'
import { prefersFlats, transpose, transposeKey } from '@/lib/chords'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * A chart as it gets read on the night, with the controls that matter while
 * reading it. Shared by the song page and the setlist, so a chart behaves the
 * same however you arrived at it.
 *
 * The transpose is a view. What is stored stays in the key it was written in,
 * so moving it for one evening never quietly becomes the record of the song.
 * Where that move is remembered — nowhere, or against a place in a setlist —
 * is the caller's business, which is why steps comes in from outside.
 */

// A phone on a music stand is further away than a phone in the hand, which is
// the whole reason this exists.
const SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl']
const SIZE_KEY = 'hq_chart_size'

// The size is a property of the room, not of the song, so it is remembered and
// survives moving between songs. Storage can be unavailable or full, and a
// chart that would not render because of a preference would be a bad trade.
function readSize() {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY))
    if (Number.isInteger(saved) && saved >= 0 && saved < SIZES.length) return saved
  } catch {
    // fall through
  }
  return 2
}

export function ChordChart({
  song,
  steps,
  onSteps,
}: {
  song: Song
  steps: number
  onSteps: (steps: number) => void
}) {
  const { t } = useT()
  const [size, setSize] = useState(readSize)
  // Seeded from how the chart was written, then his to override: somebody
  // reading Db does not want to be handed C#.
  const [flat, setFlat] = useState<boolean | null>(null)

  const flats = flat ?? prefersFlats(song.key, song.body)
  const body = useMemo(() => transpose(song.body, steps, flats), [song.body, steps, flats])
  const key = transposeKey(song.key, steps, flats)

  function resize(to: number) {
    setSize(to)
    try {
      localStorage.setItem(SIZE_KEY, String(to))
    } catch {
      // A remembered size is a convenience, not a requirement.
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSteps(steps - 1)}
            aria-label={t('song.down')}
            title={t('song.down')}
          >
            <Minus className="size-4" />
          </Button>
          {/* The key it is in now, how far that is from the page, and what
              the page itself says. All three, because the first alone leaves
              you counting and the first two leave you wondering what you are
              counting from — and on a setlist the transpose is saved, so the
              chart can be sitting in a key nobody remembers choosing. */}
          <span className="min-w-24 px-2 text-center font-mono text-sm">
            {key || t('song.noKey')}
            {steps !== 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                {steps > 0 ? `+${steps}` : steps} · {song.key || t('song.noKey')}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSteps(steps + 1)}
            aria-label={t('song.up')}
            title={t('song.up')}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setFlat(!flats)}
          aria-label={t('song.spelling')}
          title={t('song.spelling')}
        >
          <span className="text-sm font-semibold">{flats ? '♭' : '♯'}</span>
        </Button>

        {steps !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => onSteps(0)}>
            <RotateCcw className="size-4" />
            {t('song.reset', { key: song.key || '—' })}
          </Button>
        )}

        {/* Tuning happens with the chart already open, so the way to it is
            here rather than three taps away in a menu. */}
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tuner">
            <AudioLines className="size-4" />
            {t('tuner.title')}
          </Link>
        </Button>

        {/* The recording, when there is one. Its own tab: a chart is read while
            the song plays, and navigating away from it mid-verse is the
            opposite of what this is for. */}
        {song.reference_url && (
          <Button
            variant="ghost"
            size="sm"
            asChild
            // Tinted, because it is the one control here that does not change
            // what is on the page — everything else transposes, respells or
            // resizes the chart, and this one leaves for a recording.
            className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          >
            <a href={song.reference_url} target="_blank" rel="noreferrer">
              <Play className="size-4 fill-current" />
              {t('song.listen')}
            </a>
          </Button>
        )}

        <div className="ml-auto flex items-center rounded-md border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => resize(Math.max(0, size - 1))}
            aria-label={t('song.smaller')}
            title={t('song.smaller')}
          >
            <AArrowDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => resize(Math.min(SIZES.length - 1, size + 1))}
            aria-label={t('song.bigger')}
            title={t('song.bigger')}
          >
            <AArrowUp className="size-4" />
          </Button>
        </div>
      </div>

      {song.notes && <p className="mb-4 text-sm text-muted-foreground">{song.notes}</p>}

      <Card className="py-0">
        <CardContent className="px-4 py-4">
          {/* Monospace and untouched whitespace, because the column a chord
              sits in is what says which syllable it lands on. It scrolls
              sideways on its own rather than making the page do it. */}
          <pre className={cn('overflow-x-auto font-mono leading-relaxed whitespace-pre', SIZES[size])}>
            {body || t('song.blank')}
          </pre>
        </CardContent>
      </Card>
    </>
  )
}
