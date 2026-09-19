import { useMemo } from 'react'
import { Plus, Trash2, Type } from 'lucide-react'

import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/*
A chart as boxes rather than as a page of text.

The thing that makes a chart readable is that the bars line up, and the thing
that stops anyone writing one is that lining them up by hand means counting
spaces. So the bars are the interface: each beat is a box, you fill in the ones
that have something on them, and the spacing is not a thing anybody has to
think about.

What is stored is still text — `| 1 . . . | 4 . . . |` — because everything
else in HQ reads a chart as text: the transpose, the search, the sheet on the
night. This parses that text on the way in and writes it back on the way out,
so a chart typed by hand years ago opens here and a chart built here reads
anywhere.

Lines that are not bars survive as themselves. "chorus", "balik verse", a note
about the drums: those are rows too, just rows with one long box instead of
sixteen small ones.
*/

const BEATS = 4
const EMPTY = '.'

export type Row =
  | { kind: 'bars'; bars: string[][] }
  | { kind: 'text'; text: string }

/** A line is bars when it is fenced by pipes and has something between them. */
function parseLine(line: string): Row {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) {
    return { kind: 'text', text: line }
  }
  const bars = trimmed
    .slice(1, -1)
    .split('|')
    .map((bar) => {
      const beats = bar.trim().split(/\s+/).filter(Boolean)
      // Padded to a full bar so every row has the same number of boxes, and
      // cut at four so a line someone crammed does not grow the grid.
      return Array.from({ length: BEATS }, (_, i) => {
        const beat = beats[i] ?? ''
        return beat === EMPTY ? '' : beat
      })
    })
  return bars.length ? { kind: 'bars', bars } : { kind: 'text', text: line }
}

export function parseChart(body: string): Row[] {
  if (!body.trim()) return []
  return body.replace(/\r\n/g, '\n').split('\n').map(parseLine)
}

/*
Written out with every beat padded to the same width.

Monospace only lines up if the columns are the same width, and they are not:
`4#` is two characters where `1` is one, so a single space between beats walks
the third bar of one line out of step with the third bar of the next. Padding
to the widest beat in the whole chart puts every bar of every line in the same
column, which is the entire reason a chart is written in bars.

Measured across the chart rather than per line, because lining a line up with
itself was never the problem.
*/
export function writeChart(rows: Row[]): string {
  const width = Math.max(
    1,
    ...rows.flatMap((row) =>
      row.kind === 'bars' ? row.bars.flat().map((beat) => beat.trim().length) : [],
    ),
  )
  const cell = (beat: string) => (beat.trim() || EMPTY).padEnd(width)
  return rows
    .map((row) =>
      row.kind === 'text'
        ? row.text
        : `| ${row.bars.map((bar) => bar.map(cell).join(' ')).join(' | ')} |`,
    )
    .join('\n')
}

const emptyBars = (count = 4): Row => ({
  kind: 'bars',
  bars: Array.from({ length: count }, () => Array.from({ length: BEATS }, () => '')),
})

export function BarEditor({ rows, onRows }: { rows: Row[]; onRows: (rows: Row[]) => void }) {
  const { t } = useT()

  // How many bars the row above has, so a new row matches what is already
  // there instead of always being four.
  const width = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]
      if (row.kind === 'bars') return row.bars.length
    }
    return 4
  }, [rows])

  const replace = (at: number, row: Row) => onRows(rows.map((one, i) => (i === at ? row : one)))
  const add = (row: Row) => onRows([...rows, row])
  const drop = (at: number) => onRows(rows.filter((_, i) => i !== at))

  function setBeat(at: number, bar: number, beat: number, value: string) {
    const row = rows[at]
    if (row.kind !== 'bars') return
    replace(at, {
      kind: 'bars',
      bars: row.bars.map((one, b) =>
        b === bar ? one.map((cell, c) => (c === beat ? value : cell)) : one,
      ),
    })
  }

  return (
    <div className="space-y-2">
      {rows.map((row, at) => (
        <div key={at} className="flex items-start gap-1">
          {row.kind === 'bars' ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
              {row.bars.map((bar, b) => (
                <div key={b} className="flex items-center gap-0.5">
                  <span className="font-mono text-sm text-muted-foreground">|</span>
                  {bar.map((beat, c) => (
                    <Input
                      key={c}
                      value={beat}
                      onChange={(event) => setBeat(at, b, c, event.target.value)}
                      aria-label={t('song.beatOf', { beat: c + 1, bar: b + 1 })}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className={cn(
                        // Narrow enough that four bars fit on one line: a bar
                        // that wraps stops being a bar you can read across.
                        'h-8 w-7 px-0 text-center font-mono text-xs',
                        // The first beat of a bar is where a chord usually
                        // lands, so it is the one that looks like it expects
                        // something.
                        c === 0 ? 'bg-background' : 'bg-muted/40',
                      )}
                    />
                  ))}
                </div>
              ))}
              <span className="font-mono text-sm text-muted-foreground">|</span>
            </div>
          ) : (
            // A label, a note, a line of lyrics — whatever is not bars.
            <Input
              value={row.text}
              onChange={(event) => replace(at, { kind: 'text', text: event.target.value })}
              placeholder={t('song.sectionName')}
              className="h-8 min-w-0 flex-1 font-mono text-sm"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            onClick={() => drop(at)}
            aria-label={t('song.dropRow')}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => add(emptyBars(width))}>
          <Plus className="size-4" />
          {t('song.addBars')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add({ kind: 'text', text: '' })}
        >
          <Type className="size-4" />
          {t('song.addText')}
        </Button>
      </div>
    </div>
  )
}
