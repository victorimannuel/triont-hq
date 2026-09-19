/*
Working out which note is being played, from the microphone.

Autocorrelation rather than an FFT. A guitar's fundamental is often quieter
than its own overtones — pluck a low E and the loudest bin is frequently the
octave above it — so peak-picking a spectrum reports the wrong string with
total confidence. Correlation asks a different question: how far do you have to
slide this waveform along itself before it lines up again? That is the period,
and the period is the fundamental whatever the overtones are doing.

Nothing here is a library. The whole thing is one pass over a buffer, and a
dependency would be more code than the code.
*/

/** Below this the signal is room noise, and a reading would be a guess. */
const SILENCE = 0.012

/** How closely the waveform has to repeat before it counts as a note at all.
 *  Noise scores far below this; even a badly played string clears it. */
const CLARITY = 0.6

/** Widest and narrowest period worth testing, as fractions of the sample rate.
 *  A six-string in standard tuning runs 82 Hz to 330 Hz; the range here is
 *  generous enough for a dropped tuning and a capo at the twelfth fret. */
const LOWEST_HZ = 60
const HIGHEST_HZ = 1200

/**
 * The frequency of the strongest periodicity in the buffer, or null when there
 * is nothing there loud or regular enough to call a note.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const size = buffer.length

  // Root mean square, which is loudness as the ear roughly hears it rather
  // than whichever sample happened to be highest.
  let sum = 0
  for (let i = 0; i < size; i++) sum += buffer[i] * buffer[i]
  if (Math.sqrt(sum / size) < SILENCE) return null

  // Trim the quiet ends. A pluck decays, and correlating the silence after it
  // against the silence before it finds patterns that are not in the note.
  const threshold = 0.2
  let start = 0
  let end = size - 1
  while (start < size / 2 && Math.abs(buffer[start]) < threshold) start++
  while (end > size / 2 && Math.abs(buffer[end]) < threshold) end--
  const trimmed = buffer.slice(start, end)
  const length = trimmed.length
  if (length < 2) return null

  const minLag = Math.floor(sampleRate / HIGHEST_HZ)
  const maxLag = Math.min(Math.floor(sampleRate / LOWEST_HZ), length - 1)
  if (maxLag <= minLag) return null

  /*
  How well the signal matches itself at each possible period, normalised.

  The raw sum of products is the obvious thing to compute and the wrong thing
  to compare: it shrinks as the window slides, so a short period always scores
  higher than a long one whether or not it is the real one, and the bias drags
  the interpolated peak off by several cents. Dividing by the energy actually
  under each comparison removes that. The result sits between -1 and 1, where
  1 is a waveform that repeats exactly.

  Being bounded also gives the one thing a raw correlation cannot: a way to say
  "that was not a note". Room noise correlates with itself weakly at every
  period, so a best score below the floor below is silence with a hiss in it.
  */
  const score = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let product = 0
    let energy = 0
    for (let i = 0; i < length - lag; i++) {
      product += trimmed[i] * trimmed[i + lag]
      energy += trimmed[i] * trimmed[i] + trimmed[i + lag] * trimmed[i + lag]
    }
    score[lag] = energy > 0 ? (2 * product) / energy : 0
  }

  /*
  The shortest period that explains the signal, not the best-correlating one.

  A waveform lines up with itself at its period and again at every multiple of
  it, and for a plucked string the taller peak is frequently the second or
  third of those. Taking the maximum therefore reports a note an octave or a
  twelfth too low — precisely the failure this method is supposed to avoid. So:
  find how good the best match is, then walk up from the shortest period and
  take the first peak that comes close to it.
  */
  let tallest = -Infinity
  for (let i = minLag; i <= maxLag; i++) {
    if (score[i] > tallest) tallest = score[i]
  }
  if (tallest < CLARITY) return null

  const good = tallest * 0.9
  let best = -1
  for (let i = minLag + 1; i < maxLag; i++) {
    if (score[i] >= good && score[i] >= score[i - 1] && score[i] >= score[i + 1]) {
      best = i
      break
    }
  }
  if (best < 0) return null

  // A parabola through the peak and its neighbours, because the true period
  // almost never lands exactly on a sample. Without this the reading jumps in
  // steps of several cents and never settles.
  const a = score[best - 1]
  const b = score[best]
  const c = score[best + 1] ?? b
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1)
  const period = best + shift

  const hz = sampleRate / period
  if (!Number.isFinite(hz) || hz < LOWEST_HZ || hz > HIGHEST_HZ) return null
  return hz
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** A440, which is what everything else on the page assumes. */
const A4 = 440

export type Reading = {
  hz: number
  /** The nearest note, spelled with sharps. */
  note: string
  /** Which octave that note is in, the way a piano is numbered. */
  octave: number
  /** How far off it is, in hundredths of a semitone. Negative is flat. */
  cents: number
}

/** The nearest note to a frequency, and how far from it. */
export function nearestNote(hz: number): Reading {
  // Semitones from A4, which is the one fixed point everything hangs off.
  const from440 = 12 * Math.log2(hz / A4)
  const rounded = Math.round(from440)
  const cents = Math.round((from440 - rounded) * 100)

  // MIDI numbering, only because it makes the octave arithmetic honest:
  // A4 is 69, and note 60 is middle C.
  const midi = rounded + 69
  return {
    hz,
    note: NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents,
  }
}

/** Standard tuning, low to high, for the row of targets under the dial. */
export const GUITAR = [
  { note: 'E', octave: 2, hz: 82.41 },
  { note: 'A', octave: 2, hz: 110.0 },
  { note: 'D', octave: 3, hz: 146.83 },
  { note: 'G', octave: 3, hz: 196.0 },
  { note: 'B', octave: 3, hz: 246.94 },
  { note: 'E', octave: 4, hz: 329.63 },
] as const
