// Rasterises the app icon into the PNG sizes a PWA install needs.
// Run once after changing the mark: node scripts/make-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')

const INK = '#ffffff'
const BRAND = '#2f5fd8'

// `padding` leaves the safe area a maskable icon needs: Android may crop the
// outer ~10% on each side to fit its own shape.
function svg({ size, padding, background }) {
  const s = size
  const p = padding
  const inner = s - p * 2
  // Same flag-on-a-pole mark as the app, scaled into the icon box.
  const x = (v) => p + (v / 32) * inner
  // A badge is read for its alpha channel alone and painted white by Android,
  // so a filled background would arrive as a solid white square. `background:
  // null` leaves it transparent and lets the mark itself be the shape.
  const plate = background
    ? `<rect width="${s}" height="${s}" fill="${background}"/>`
    : ''
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${plate}
  <path d="M${x(10.75)} ${x(7.5)} V${x(24.5)}" stroke="${INK}" stroke-width="${(2.4 / 32) * inner}"
        stroke-linecap="round" opacity="0.95"/>
  <path d="M${x(12.6)} ${x(8.6)} H${x(23.4)} l${(-3.1 / 32) * inner} ${(3.6 / 32) * inner}
           ${(3.1 / 32) * inner} ${(3.6 / 32) * inner} H${x(12.6)} Z" fill="${INK}"/>
</svg>`)
}

// The mark's own bounds inside the 32-unit box: the pole runs 6.3..25.7 with
// its round caps, the flag reaches x 23.4. Framing a square on that centre is
// what makes the badge fill the status bar rather than float in it.
function badgeSvg(size) {
  const view = { x: 6.275, y: 5.8, side: 20.4 }
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
     viewBox="${view.x} ${view.y} ${view.side} ${view.side}">
  <path d="M10.75 7.5 V24.5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M12.6 8.6 H23.4 l-3.1 3.6 3.1 3.6 H12.6 Z" fill="${INK}"/>
</svg>`)
}

const targets = [
  // Windows builds the taskbar and shortcut icon from whatever the manifest
  // offers. Given only 192 and 512 it downscales, and a downscaled mark is
  // what makes an installed app look like it has no icon of its own.
  { file: 'pwa-48.png', size: 48, padding: 0, background: BRAND },
  { file: 'pwa-64.png', size: 64, padding: 0, background: BRAND },
  { file: 'pwa-96.png', size: 96, padding: 0, background: BRAND },
  { file: 'pwa-128.png', size: 128, padding: 0, background: BRAND },
  { file: 'pwa-192.png', size: 192, padding: 0, background: BRAND },
  { file: 'pwa-256.png', size: 256, padding: 0, background: BRAND },
  { file: 'pwa-512.png', size: 512, padding: 0, background: BRAND },
  // Maskable needs the mark inset and the whole square filled.
  { file: 'pwa-maskable-512.png', size: 512, padding: 64, background: BRAND },
  { file: 'apple-touch-icon.png', size: 180, padding: 0, background: BRAND },
  { file: 'favicon-32.png', size: 32, padding: 0, background: BRAND },
]

await mkdir(publicDir, { recursive: true })

for (const target of targets) {
  const png = await sharp(svg(target)).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(publicDir, target.file), png)
  console.log(`${target.file.padEnd(24)} ${target.size}x${target.size}  ${png.length} B`)
}

// The status-bar badge: mark only, no plate, framed tight so Android has
// something to show at 24dp.
{
  const png = await sharp(badgeSvg(96)).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(publicDir, 'badge-96.png'), png)
  console.log(`${'badge-96.png'.padEnd(24)} 96x96  ${png.length} B`)
}

await writeFile(
  resolve(publicDir, 'favicon.svg'),
  svg({ size: 64, padding: 0, background: BRAND }),
)
console.log('favicon.svg')
