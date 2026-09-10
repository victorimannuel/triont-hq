// Rasterises the app icon into the PNG sizes a PWA install needs, and the
// launch images iOS wants. Run once after changing the mark:
//   node scripts/make-icons.mjs
// It rewrites the block of apple-touch-startup-image links in index.html too,
// so the tags and the files can never drift apart.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')
const splashDir = resolve(publicDir, 'splash')
const indexHtml = resolve(here, '../index.html')

// Two treatments, because the places these icons land want opposite things.
//
// A taskbar or a browser tab sits the icon on whatever colour the user's theme
// happens to be, so those get the bare mark on nothing — the same clay the app
// draws its own logo in, but a shade lighter than the token: light enough to
// survive a dark bar and dark enough to survive a light one. The tile's umber
// cannot do both; on a dark taskbar it disappears.
//
// A home-screen tile is the opposite. Android crops the maskable icon to its
// own shape and iOS composites a transparent icon onto black, so both need the
// square filled — and there the umber is the background and the mark is white.
const MARK_INK = '#a35d2e'
const TILE = '#3a1e0e'
const TILE_INK = '#ffffff'

// The two grounds a launch image sits on, matching the page's own background
// in each theme so the splash and the first paint are the same colour.
const PAPER = '#fcfaf7'
const NIGHT = '#110f0c'

// The mark in a 32-unit box: the Triont mark, drawn as strokes so the icon is
// the logo scaled rather than a redraw of it. A ring open on the four axes,
// and inside it two stems, each with an arm reaching up and outward — one
// from the foot of the upper stem, one from the head of the lower. The
// proportions were measured off the original artwork; the stems sit a little
// further apart than there and the figure is a touch smaller, so nothing
// touches at favicon size.
const MARK = {
  centre: 16,
  ring: { radius: 12.4, stroke: 2 },
  // Openings in the ring, as chords between the ends of the arcs. The top and
  // bottom ones span the two stems; the side ones are a little narrower.
  gaps: { top: 4.2, side: 3.6 },
  figure: {
    stroke: 2.4,
    // Half the distance between the two stems.
    stem: 2.1,
    // Ends of the stems and the corners where the arms leave them, as
    // distances from the centre: above it for the upper piece, below it for
    // the lower.
    top: 8.75,
    upperCorner: 1.4,
    lowerCorner: 3.2,
    bottom: 8.78,
    // How far each arm reaches, and the angle it climbs at from horizontal.
    upperArm: 6,
    lowerArm: 7.4,
    angle: 33,
  },
}

// Furthest the mark reaches from the centre, stroke included. It sets both the
// badge's frame and how much room the mark needs inside the icon box.
const MARK_REACH = MARK.ring.radius + MARK.ring.stroke / 2

// Sub-pixel precision no rasteriser can use, and it makes favicon.svg unreadable.
const round = (v) => Number(v.toFixed(3))

// The ring as four arcs. Angles run clockwise from the top; each opening is
// centred on an axis and sized by its chord. `pt` places a point in the target
// box and `len` scales a bare length.
function ring(pt, len, ink) {
  const { radius, stroke } = MARK.ring
  const half = (chord) => (Math.asin(chord / 2 / radius) * 180) / Math.PI
  const top = half(MARK.gaps.top)
  const side = half(MARK.gaps.side)
  const spans = [
    [top, 90 - side],
    [90 + side, 180 - top],
    [180 + top, 270 - side],
    [270 + side, 360 - top],
  ]
  const at = (degrees) => {
    const a = (degrees * Math.PI) / 180
    const x = round(pt(MARK.centre + radius * Math.sin(a)))
    const y = round(pt(MARK.centre - radius * Math.cos(a)))
    return `${x} ${y}`
  }
  const r = round(len(radius))
  return spans
    .map(
      ([from, to]) => `<path d="M${at(from)} A${r} ${r} 0 0 1 ${at(to)}"
        fill="none" stroke="${ink}" stroke-width="${round(len(stroke))}" stroke-linecap="round"/>`,
    )
    .join('\n  ')
}

// The stems with their arms, drawn for one side and mirrored: the upper piece
// is a V whose straight leg is the stem, the lower one a stem with the arm
// leaving its head.
function figure(pt, len, ink) {
  const f = MARK.figure
  const c = MARK.centre
  const rise = Math.sin((f.angle * Math.PI) / 180)
  const run = Math.cos((f.angle * Math.PI) / 180)
  const pieces = (side) => {
    const x = c + side * f.stem
    const out = (length) => x + side * length * run
    const p = (px, py) => `${round(pt(px))} ${round(pt(py))}`
    return [
      `M${p(x, c - f.top)} L${p(x, c - f.upperCorner)} L${p(out(f.upperArm), c - f.upperCorner - f.upperArm * rise)}`,
      `M${p(out(f.lowerArm), c + f.lowerCorner - f.lowerArm * rise)} L${p(x, c + f.lowerCorner)} L${p(x, c + f.bottom)}`,
    ]
  }
  return [...pieces(-1), ...pieces(1)]
    .map(
      (d) => `<path d="${d}"
        fill="none" stroke="${ink}" stroke-width="${round(len(f.stroke))}"
        stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('\n  ')
}

function mark(pt, len, ink) {
  return `${ring(pt, len, ink)}
  ${figure(pt, len, ink)}`
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

/*
The launch images, which only iOS uses.

Android builds its splash from the manifest — the name, the background colour
and the 512 icon — and needs nothing here. iOS ignores the manifest for this
entirely and looks for an image whose media query matches the device exactly,
down to the pixel ratio and the orientation. Miss and it shows a white screen,
which is what an installed HQ does on an iPhone today.

So every size is spelled out. Portrait and landscape are separate images, and
each has a dark twin: a page that opens on a dark theme should not flash white
first. Listing the dark ones after the plain ones is what makes Safari prefer
them when the phone is in dark mode.
*/
const DEVICES = [
  // width, height in CSS pixels, then the pixel ratio. Several phones share a
  // line — the comment names one of them, not all.
  { w: 375, h: 667, dpr: 2, note: 'SE, 8' },
  { w: 414, h: 736, dpr: 3, note: '8 Plus' },
  { w: 375, h: 812, dpr: 3, note: 'X, 11 Pro, 13 mini' },
  { w: 414, h: 896, dpr: 2, note: 'XR, 11' },
  { w: 414, h: 896, dpr: 3, note: 'XS Max, 11 Pro Max' },
  { w: 390, h: 844, dpr: 3, note: '12, 13, 14' },
  { w: 393, h: 852, dpr: 3, note: '14 Pro, 15, 16' },
  { w: 402, h: 874, dpr: 3, note: '16 Pro' },
  { w: 428, h: 926, dpr: 3, note: '13 Pro Max, 14 Plus' },
  { w: 430, h: 932, dpr: 3, note: '15 Pro Max, 16 Plus' },
  { w: 440, h: 956, dpr: 3, note: '16 Pro Max' },
  { w: 744, h: 1133, dpr: 2, note: 'iPad mini' },
  { w: 768, h: 1024, dpr: 2, note: 'iPad 9.7' },
  { w: 810, h: 1080, dpr: 2, note: 'iPad 10.2' },
  { w: 820, h: 1180, dpr: 2, note: 'iPad Air 10.9' },
  { w: 834, h: 1112, dpr: 2, note: 'iPad Air 10.5' },
  { w: 834, h: 1194, dpr: 2, note: 'iPad Pro 11' },
  { w: 1024, h: 1366, dpr: 2, note: 'iPad Pro 12.9' },
]

// The mark alone on a flat ground, centred. A quarter of the short side: big
// enough to be the point of the screen, small enough that it never crowds a
// notch or a home indicator.
function splashSvg(width, height, ground) {
  const reach = Math.round(Math.min(width, height) * 0.25)
  const left = Math.round((width - reach) / 2)
  const top = Math.round((height - reach) / 2)
  const pt = (v) => (v / 32) * reach
  const len = pt
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${ground}"/>
  <g transform="translate(${left} ${top})">
    ${mark(pt, len, MARK_INK)}
  </g>
</svg>`)
}

await mkdir(splashDir, { recursive: true })

const links = []
let splashBytes = 0

for (const theme of [
  { suffix: '', ground: PAPER, query: '' },
  { suffix: '-dark', ground: NIGHT, query: ' and (prefers-color-scheme: dark)' },
]) {
  for (const device of DEVICES) {
    for (const orientation of ['portrait', 'landscape']) {
      const across = orientation === 'portrait' ? device.w * device.dpr : device.h * device.dpr
      const down = orientation === 'portrait' ? device.h * device.dpr : device.w * device.dpr
      const file = `splash-${across}x${down}${theme.suffix}.png`
      const png = await sharp(splashSvg(across, down, theme.ground))
        .png({ compressionLevel: 9, palette: true })
        .toBuffer()
      await writeFile(resolve(splashDir, file), png)
      splashBytes += png.length
      links.push(
        `    <link rel="apple-touch-startup-image" href="/splash/${file}"\n` +
          `          media="(device-width: ${device.w}px) and (device-height: ${device.h}px)` +
          ` and (-webkit-device-pixel-ratio: ${device.dpr})` +
          ` and (orientation: ${orientation})${theme.query}" />`,
      )
    }
  }
}
console.log(`splash/                  ${links.length} files  ${splashBytes} B`)

// Written between markers rather than appended, so running this twice does not
// leave two copies of the block.
const START = '    <!-- splash:start -->'
const END = '    <!-- splash:end -->'
const html = await readFile(indexHtml, 'utf8')
const from = html.indexOf(START)
const to = html.indexOf(END)
if (from === -1 || to === -1) {
  throw new Error(`index.html is missing the ${START} / ${END} markers`)
}
await writeFile(
  indexHtml,
  `${html.slice(0, from + START.length)}\n${links.join('\n')}\n${html.slice(to)}`,
)
console.log('index.html               startup-image links rewritten')
