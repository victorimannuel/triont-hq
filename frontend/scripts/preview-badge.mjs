// Renders the badge the way Android does — alpha channel only, painted white
// on the status bar — so what the phone will actually show can be looked at
// instead of guessed.
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../public/badge-96.png')
const out = '/tmp/badge-preview.png'

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

// Keep only alpha: white where opaque, dark grey where not, which is the
// status bar's own contrast.
const flat = Buffer.alloc(info.width * info.height * 3)
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) {
  const a = data[i + 3]
  flat[j] = flat[j + 1] = flat[j + 2] = a > 127 ? 255 : 40
}

await sharp(flat, { raw: { width: info.width, height: info.height, channels: 3 } })
  .resize(192, 192, { kernel: 'nearest' })
  .png()
  .toFile(out)

console.log('ditulis ke', out)
