export type Theme = 'system' | 'light' | 'dark'

const KEY = 'hq-theme'
export const THEMES: Theme[] = ['system', 'light', 'dark']

export const THEME_LABELS: Record<Theme, string> = {
  system: 'Ikut sistem',
  light: 'Terang',
  dark: 'Gelap',
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private windows and blocked site data both throw here; the default is fine.
  }
  return 'system'
}

// 'system' removes the attribute so the prefers-color-scheme rules take over
// again, which is why the CSS never defines a colour only inside a media query.
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Not being able to remember the choice is not worth failing over.
  }
}

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
}
