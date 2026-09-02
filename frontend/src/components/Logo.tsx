import { cn } from '@/lib/utils'

// Two rings closing on a solid core, broken at the foot: things gathered around
// one centre, which is what the app is for. Drawn as strokes on nothing rather
// than a mark on a tile, so it takes the colour it is given and stays legible
// at 20px. The icon files are the same geometry — see scripts/make-icons.mjs.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="HQ"
      className={cn('size-7 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M13.21 28.08 A12.4 12.4 0 1 1 18.79 28.08" />
      <path d="M13.07 22.58 A7.2 7.2 0 1 1 18.93 22.58" />
      <rect x="13.3" y="13.3" width="5.4" height="5.4" rx="1.05" fill="currentColor" stroke="none" />
    </svg>
  )
}
