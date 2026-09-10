import { cn } from '@/lib/utils'

// The Triont mark: a ring open on the four axes, and inside it two stems that
// each send an arm up and outward. Drawn as strokes on nothing rather than a
// mark on a tile, so it takes the colour it is given and stays legible at
// 20px. The icon files are the same geometry — see scripts/make-icons.mjs,
// which also holds the measurements these numbers come from.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="HQ"
      className={cn('size-7 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g strokeWidth="2">
        <path d="M18.1 3.78 A12.4 12.4 0 0 1 28.27 14.2" />
        <path d="M28.27 17.8 A12.4 12.4 0 0 1 18.1 28.22" />
        <path d="M13.9 28.22 A12.4 12.4 0 0 1 3.73 17.8" />
        <path d="M3.73 14.2 A12.4 12.4 0 0 1 13.9 3.78" />
      </g>
      <g strokeWidth="2.4">
        <path d="M13.9 7.25 L13.9 14.6 L8.87 11.33" />
        <path d="M7.69 15.17 L13.9 19.2 L13.9 24.78" />
        <path d="M18.1 7.25 L18.1 14.6 L23.13 11.33" />
        <path d="M24.31 15.17 L18.1 19.2 L18.1 24.78" />
      </g>
    </svg>
  )
}
