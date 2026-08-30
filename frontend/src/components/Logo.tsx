import { cn } from '@/lib/utils'

// A flag planted on a pole: the most literal reading of "headquarters", and it
// stays legible at 20px where a two-letter monogram turns to mush.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="HQ"
      className={cn('size-7 shrink-0', className)}
    >
      <defs>
        <linearGradient id="hq-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#hq-mark)" />
      <path
        d="M10.75 7.5 V24.5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path d="M12.6 8.6 H23.4 l-3.1 3.6 3.1 3.6 H12.6 Z" fill="white" />
    </svg>
  )
}
