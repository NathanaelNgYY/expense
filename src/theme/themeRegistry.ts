export const THEME_STORAGE_KEY = 'budget-tracker-theme-v2'

export const THEMES = [
  {
    id: 'original-dark',
    name: 'Original Dark',
    description: 'The app’s original dark wallet design and screen flow.',
    swatches: ['#1a1b1c', '#c98d68', '#ece9e4'],
  },
  {
    id: 'deep-sea',
    name: 'Deep Sea Revised',
    description: 'Calm aqua, circular progress, and soft spatial grouping.',
    swatches: ['#061012', '#52d8d0', '#eafaf9'],
  },
  {
    id: 'copper-current',
    name: 'Copper Current',
    description: 'Burnished orange, ledger geometry, and dense financial data.',
    swatches: ['#100d09', '#ff9147', '#fff5e9'],
  },
  {
    id: 'berry-circuit',
    name: 'Berry Circuit',
    description: 'Deep plum, acid-lime signals, and rounded ribbon layouts.',
    swatches: ['#170a18', '#d7ff6f', '#fff2ff'],
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'original-dark'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some(theme => theme.id === value)
}

export function readStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeId(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
