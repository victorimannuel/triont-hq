import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { detectPitch, nearestNote, GUITAR, type Reading } from '@/lib/pitch'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorNote, PageHeader } from '@/components/bits'

/*
A tuner, on the same phone the chart is being read on.

Nothing leaves the device and nothing is stored: the microphone feeds an
analyser, the analyser is read on every frame, and the number on screen is
thrown away as soon as the next one arrives. The permission is asked for on
the button rather than on arrival, because a page that grabs the microphone
the moment it opens is a page nobody trusts twice.

Within five cents is in tune. That is roughly where a good ear stops hearing a
beat against a reference, and it is the tolerance a pedal tuner uses.
*/
const IN_TUNE = 5

export default function Tuner() {
  const { t } = useT()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState<Reading | null>(null)

  // Everything the browser hands back, so it can all be given up again.
  const stream = useRef<MediaStream | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const frame = useRef(0)

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current)
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    void audio.current?.close()
    audio.current = null
    setListening(false)
    setReading(null)
  }, [])

  // Letting go of the microphone on the way out matters more than usual: the
  // recording light stays on otherwise, which is alarming and fair enough.
  useEffect(() => stop, [stop])

  async function start() {
    setError('')
    try {
      const got = await navigator.mediaDevices.getUserMedia({
        // Every one of these is designed to make speech clearer and a plucked
        // string less like itself. Off, all of them.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      stream.current = got

      const context = new AudioContext()
      audio.current = context
      const source = context.createMediaStreamSource(got)
      const analyser = context.createAnalyser()
      // Long enough to hold two periods of a low E at any sample rate, which
      // is the least the correlation needs to find one.
      analyser.fftSize = 4096
      source.connect(analyser)

      const buffer = new Float32Array(analyser.fftSize)
      setListening(true)

      const read = () => {
        analyser.getFloatTimeDomainData(buffer)
        const hz = detectPitch(buffer, context.sampleRate)
        setReading(hz === null ? null : nearestNote(hz))
        frame.current = requestAnimationFrame(read)
      }
      read()
    } catch (err) {
      // Refused, or no microphone, or an insecure origin — all of which reach
      // here as the same kind of error and none of which the page can fix.
      setError(err instanceof Error && err.name === 'NotAllowedError'
        ? t('tuner.denied')
        : t('tuner.failed'))
      stop()
    }
  }

  const cents = reading?.cents ?? 0
  const tuned = reading !== null && Math.abs(cents) <= IN_TUNE
  // The needle, as a percentage across the dial. Fifty cents either way fills
  // it; anything further is a different note and pins at the end.
  const offset = 50 + Math.max(-50, Math.min(50, cents))

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t('tuner.title')} description={t('tuner.subtitle')} back="/songs" />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent className="space-y-6 py-8">
          <div className="text-center">
            <div
              className={cn(
                'text-7xl font-semibold tabular-nums transition-colors',
                !reading && 'text-muted-foreground/30',
                tuned && 'text-success',
              )}
            >
              {reading ? reading.note : '—'}
              {reading && (
                <span className="align-super text-2xl text-muted-foreground">
                  {reading.octave}
                </span>
              )}
            </div>
            <div className="mt-1 h-5 text-sm text-muted-foreground tabular-nums">
              {reading
                ? `${reading.hz.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents}`
                : listening
                  ? t('tuner.waiting')
                  : ''}
            </div>
          </div>

          {/* The dial. Flat to the left, sharp to the right, and a band down
              the middle wide enough to actually land in. */}
          <div className="relative h-14">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
            <div
              className={cn(
                'absolute top-1/2 h-6 -translate-y-1/2 rounded-full transition-colors',
                tuned ? 'bg-success/20' : 'bg-muted-foreground/10',
              )}
              style={{ left: `${50 - IN_TUNE}%`, width: `${IN_TUNE * 2}%` }}
            />
            {reading && (
              <div
                className={cn(
                  'absolute top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all',
                  tuned ? 'bg-success' : 'bg-primary',
                )}
                style={{ left: `${offset}%` }}
              />
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-xs text-muted-foreground">
              <span>♭</span>
              <span>♯</span>
            </div>
          </div>

          {/* Standard tuning, for when what you want is the name of the string
              you are on rather than the note you happen to be playing. */}
          <div className="flex justify-between gap-1">
            {GUITAR.map((string, at) => (
              <div
                key={`${string.note}${string.octave}-${at}`}
                className={cn(
                  'flex-1 rounded-md border py-2 text-center text-sm font-medium transition-colors',
                  reading?.note === string.note && reading?.octave === string.octave
                    ? tuned
                      ? 'border-success bg-success/10 text-success'
                      : 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground',
                )}
              >
                {string.note}
                <span className="text-xs text-muted-foreground">{string.octave}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            {listening ? (
              <Button variant="outline" onClick={stop}>
                <MicOff className="size-4" />
                {t('tuner.stop')}
              </Button>
            ) : (
              <Button onClick={() => void start()}>
                <Mic className="size-4" />
                {t('tuner.start')}
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">{t('tuner.privacy')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
