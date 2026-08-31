// A badge is read for its alpha channel alone. Empty alpha means no badge at
// all; full alpha means the solid white square this replaced. Neither is what
// we want, so this reports the share and fails loudly outside a sane range.
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const file = resolve(here, '../public/badge-96.png')

const { data, info } = await sharp(file)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

let opaque = 0
let clear = 0
for (let i = 3; i < data.length; i += info.channels) {
  if (data[i] > 200) opaque += 1
  else if (data[i] < 40) clear += 1
}

const total = info.width * info.height
const pct = (n) => `${((100 * n) / total).toFixed(0)}%`

console.log(`ukuran        : ${info.width}x${info.height}`)
console.log(`piksel penuh  : ${opaque} (${pct(opaque)})   <- ini bentuk badge-nya`)
console.log(`piksel bening : ${clear} (${pct(clear)})   <- ini yang dulu bikin kotak putih`)
console.log(`sudut kiri-atas alpha: ${data[3]} (harus 0)`)

if (data[3] !== 0) throw new Error('sudutnya nggak transparan, bakal jadi kotak lagi')
if (opaque / total > 0.5) throw new Error('kepenuhan, bakal kelihatan seperti kotak')
if (opaque / total < 0.02) throw new Error('kekosongan, badge-nya nggak bakal kelihatan')
console.log('\nbadge oke')
