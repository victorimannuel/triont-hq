/**
 * Just enough theory to move a chart into another key.
 *
 * Nothing here understands harmony. It recognises a chord token, moves its
 * root and its bass note by a number of semitones, and leaves every other
 * character alone — including the spacing, because which column a chord sits
 * in is what says which syllable it lands on.
 */

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * What may follow a root and still leave it a chord. Deliberately closed:
 * this is the rule that stops the word "Amazing" being read as an A.
 */
const QUALITY = /^(?:maj|min|dim|aug|sus|add|alt|m|M|°|ø|\+|-|\d|#|b|\(|\)|,)*$/

/** Bar lines, repeats and rest marks: not chords, but not lyrics either. */
const FILLER = /^(?:\|+|:\||\|:|%|\/+|-+|\(?\d+x\)?|\(?x\d+\)?|,)$/i

type Parsed = { root: string; quality: string; bass: string }

function parse(token: string): Parsed | null {
  // A chord is short. The cap also keeps the alternation above from
  // backtracking its way through a long word.
  if (!token || token.length > 14) return null

  let head = token
  let bass = ''
  const slash = token.lastIndexOf('/')
  if (slash > 0 && /^[A-G][#b]?$/.test(token.slice(slash + 1))) {
    head = token.slice(0, slash)
    bass = token.slice(slash + 1)
  }

  const match = /^([A-G][#b]?)(.*)$/.exec(head)
  if (!match || !QUALITY.test(match[2])) return null
  return { root: match[1], quality: match[2], bass }
}

function shift(note: string, steps: number, flat: boolean) {
  const accidental = note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0
  const to = (((SEMITONE[note[0]] + accidental + steps) % 12) + 12) % 12
  return (flat ? FLATS : SHARPS)[to]
}

/** The moved chord, or null when the token was never one. */
export function transposeToken(token: string, steps: number, flat: boolean) {
  const parsed = parse(token)
  if (!parsed) return null
  const root = shift(parsed.root, steps, flat)
  const bass = parsed.bass ? '/' + shift(parsed.bass, steps, flat) : ''
  return root + parsed.quality + bass
}

/**
 * True when everything on the line that is not punctuation is a chord. A chord
 * written above the syllable it lands on always has a line to itself, so this
 * is what keeps a lyric containing "A" or "Em" from being rewritten.
 */
export function isChordLine(line: string) {
  // A chart names its sections in front of the bars — "Intro   | G | C |" —
  // with or without a colon, so everything from the first bar on is the part
  // that has to be chords. A line with no bars falls back to the colon, and
  // one with neither has to be chords all the way across.
  const bar = line.indexOf('|')
  let rest = line
  if (bar > -1) {
    rest = line.slice(bar)
  } else {
    const colon = line.indexOf(':')
    if (colon > -1 && colon < 20) rest = line.slice(colon + 1)
  }

  const tokens = rest.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false

  let chords = 0
  for (const token of tokens) {
    if (FILLER.test(token)) continue
    if (parse(token) === null) return false
    chords++
  }
  return chords > 0
}

/**
 * The whole chart in another key. Chords in square brackets move wherever they
 * are, because the brackets already say what they are; everything else moves
 * only on a line that is chords all the way across.
 */
export function transpose(body: string, steps: number, flat: boolean) {
  if (!steps) return body
  return body
    .split('\n')
    .map((line) => transposeLine(line, steps, flat))
    .join('\n')
}

function transposeLine(line: string, steps: number, flat: boolean) {
  const inlined = line.replace(/\[([^\]\s]+)\]/g, (all, token: string) => {
    const moved = transposeToken(token, steps, flat)
    return moved === null ? all : `[${moved}]`
  })
  if (inlined !== line) return inlined
  if (!isChordLine(line)) return line

  // Words and the gaps between them, kept apart so a chord that gets longer or
  // shorter can pay for it out of the space that follows and leave the next
  // one in its own column.
  const pieces = line.match(/\s+|\S+/g) ?? []
  for (let i = 0; i < pieces.length; i++) {
    if (/^\s/.test(pieces[i])) continue
    const moved = transposeToken(pieces[i], steps, flat)
    if (moved === null) continue

    const grew = moved.length - pieces[i].length
    pieces[i] = moved

    // A single space is a separator, not a column: "| Bb | Eb |" wants to stay
    // exactly that tidy. Only a real run of spaces is holding a chord over the
    // syllable below it, and only that is worth repaying.
    const gap = pieces[i + 1]
    if (!gap || !/^\s+$/.test(gap) || gap.length < 2) continue
    if (grew > 0 && gap.length > grew) pieces[i + 1] = gap.slice(grew)
    else if (grew < 0) pieces[i + 1] = gap + ' '.repeat(-grew)
  }
  return pieces.join('')
}

/** The written key, moved. Left alone when it was never a key to begin with. */
export function transposeKey(key: string, steps: number, flat: boolean) {
  if (!key.trim()) return ''
  return transposeToken(key.trim(), steps, flat) ?? key
}

/**
 * Whether to spell the black notes with flats. Taken from how the chart was
 * written rather than guessed: somebody who wrote Bb wants Eb, not D#.
 */
export function prefersFlats(key: string, body: string) {
  if (key.includes('b')) return true
  if (key.includes('#')) return false
  return /(^|\s)[A-G]b/.test(body)
}
