import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Song } from '@/types'
import { Button } from '@/components/ui/button'
import { ChordChart } from '@/components/ChordChart'
import { ErrorNote, Loading, PageHeader } from '@/components/bits'

/**
 * One song on its own. The transpose lives only as long as the page: a song
 * opened by itself is being looked at rather than played through, and there is
 * no evening here for a key to belong to. That is what a setlist is for.
 */
export default function SongSheet() {
  const { id } = useParams()
  const { t } = useT()

  const [song, setSong] = useState<Song | null>(null)
  const [error, setError] = useState('')
  const [steps, setSteps] = useState(0)

  useEffect(() => {
    if (!id) return
    api
      .song(Number(id))
      .then(setSong)
      .catch((err) => setError(err instanceof Error ? err.message : t('song.failed')))
  }, [id, t])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!song) return <Loading />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back="/songs"
        title={song.title}
        description={[song.artist, song.tempo > 0 ? t('song.bpm', { n: song.tempo }) : '']
          .filter(Boolean)
          .join(' · ')}
        action={
          <Button asChild variant="outline">
            <Link to={`/songs/${song.id}/edit`}>
              <Pencil className="size-4" />
              {t('common.edit')}
            </Link>
          </Button>
        }
      />

      <ChordChart song={song} steps={steps} onSteps={setSteps} />
    </div>
  )
}
