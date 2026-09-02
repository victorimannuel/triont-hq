// Rasterises the app icon into the PNG sizes a PWA install needs.
// Run once after changing the mark: node scripts/make-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')

// Two treatments, because the places these icons land want opposite things.
//
// A taskbar or a browser tab sits the icon on whatever colour the user's theme
// happens to be, so those get the bare mark on nothing — the same blue the app
// draws its own logo in, light enough to survive a dark bar and dark enough to
// survive a light one. The artwork's navy cannot: on a dark taskbar it
// disappears.
//
// A home-screen tile is the opposite. Android crops the maskable icon to its
// own shape and iOS composites a transparent icon onto black, so both need the
// square filled — and there the navy is the background and the mark is white.
const MARK_INK = '#2f5fd8'
const TILE = '#0a3072'
const TILE_INK = '#ffffff'

// The mark in a 32-unit box: two rings broken at the foot, closing on a solid
// core. Every number is the artwork's own proportion — outer radius 0.3875 of
// the box, stroke 0.05 — so the icon is the logo scaled, not a redraw of it.
const MARK = {
  centre: 16,
  outerRadius: 12.4,
  innerRadius: 7.2,
  stroke: 1.6,
  // How much of each ring is missing at the bottom, in degrees. The inner one
  // opens wider so the two breaks read as one gap rather than a slot.
  outerGap: 26,
  innerGap: 48,
  core: 5.4,
  coreRadius: 1.05,
}

// Furthest the mark reaches from the centre, round caps included. It sets both
// the badge's frame and how much room the mark needs inside the icon box.
const MARK_REACH = MARK.outerRadius + MARK.stroke / 2

// Sub-pixel precision no rasteriser can use, and it makes favicon.svg unreadable.
const round = (v) => Number(v.toFixed(3))

// One ring, drawn the long way round so the break lands at the bottom. `pt`
// places a point in the target box and `len` scales a bare length.
function ring(radius, gapDegrees, pt, len, ink) {
  const half = ((gapDegrees / 2) * Math.PI) / 180
  // Measured from the foot of the circle, which is where the break is centred.
  const dx = radius * Math.sin(half)
  const dy = radius * Math.cos(half)
  const foot = round(pt(MARK.centre + dy))
  const from = `${round(pt(MARK.centre - dx))} ${foot}`
  const to = `${round(pt(MARK.centre + dx))} ${foot}`
  const r = round(len(radius))
  // large-arc and sweep both set: the long way, clockwise, over the top.
  return `<path d="M${from} A${r} ${r} 0 1 1 ${to}"
        fill="none" stroke="${ink}" stroke-width="${round(len(MARK.stroke))}" stroke-linecap="round"/>`
}

function mark(pt, len, ink) {
  const corner = round(pt(MARK.centre - MARK.core / 2))
  const side = round(len(MARK.core))
  return `${ring(MARK.outerRadius, MARK.outerGap, pt, len, ink)}
  ${ring(MARK.innerRadius, MARK.innerGap, pt, len, ink)}
  <rect x="${corner}" y="${corner}" width="${side}" height="${side}"
        rx="${round(len(MARK.coreRadius))}" fill="${ink}"/>`
}

// `padding` leaves the safe area a maskable icon needs: Android may crop the
// outer ~10% on each side to fit its own shape.
function svg({ size, padding, background }) {
  const s = size
  const p = padding
  const inner = s - p * 2
  const pt = (v) => p + (v / 32) * inner
  const len = (v) => (v / 32) * inner
  // No plate means the icon floats on whatever is behind it, which is what a
  // taskbar and a browser tab want; a filled one is a tile, and there the mark
  // has to invert to stay visible.
  const plate = background ? `  <rect width="${s}" height="${s}" fill="${background}"/>\n` : ''
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
${plate}  ${mark(pt, len, background ? TILE_INK : MARK_INK)}
</svg>`)
}

// Framing the square on the mark's own bounds is what makes the badge fill the
// status bar rather than float in it.
function badgeSvg(size) {
  const edge = MARK.centre - MARK_REACH
  const identity = (v) => v
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
     viewBox="${edge} ${edge} ${MARK_REACH * 2} ${MARK_REACH * 2}">
  ${mark(identity, identity, MARK_INK)}
</svg>`)
}

const targets = [
  // Windows builds the taskbar and shortcut icon from whatever the manifest
  // offers. Given only 192 and 512 it downscales, and a downscaled mark is
  // what makes an installed app look like it has no icon of its own.
  { file: 'pwa-48.png', size: 48, padding: 0, background: null },
  { file: 'pwa-64.png', size: 64, padding: 0, background: null },
  { file: 'pwa-96.png', size: 96, padding: 0, background: null },
  { file: 'pwa-128.png', size: 128, padding: 0, background: null },
  { file: 'pwa-192.png', size: 192, padding: 0, background: null },
  { file: 'pwa-256.png', size: 256, padding: 0, background: null },
  { file: 'pwa-512.png', size: 512, padding: 0, background: null },
  // Maskable needs the mark inset and the whole square filled.
  { file: 'pwa-maskable-512.png', size: 512, padding: 64, background: TILE },
  // iOS composites a transparent touch icon onto black, so this one is a tile.
  { file: 'apple-touch-icon.png', size: 180, padding: 0, background: TILE },
  { file: 'favicon-32.png', size: 32, padding: 0, background: null },
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
  svg({ size: 64, padding: 0, background: null }),
)
console.log('favicon.svg')
