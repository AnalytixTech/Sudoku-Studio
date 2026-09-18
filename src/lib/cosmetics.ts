// Cosmetic unlocks: what coins are actually for.
//
// Helpers alone were a poor sink -- a strong player never needs a hint, so the
// currency meant nothing to exactly the people who earned the most of it.
// Cosmetics give every player something to spend on, which is also what makes a
// rewarded ad worth watching.
//
// Some items additionally require a Level, so lifetime XP has a purpose beyond
// being a number on the profile screen.

import { levelFromXp, loadWallet, spend } from './economy'

export type CosmeticKind = 'theme' | 'digits' | 'confetti'

export interface Cosmetic {
  id: string
  kind: CosmeticKind
  name: string
  blurb: string
  /** 0 = free, owned from the start. */
  price: number
  /** Minimum player level required to buy. */
  minLevel?: number
  /** Swatch colours for the shop preview. */
  swatch: string[]
}

export const THEMES: Cosmetic[] = [
  {
    id: 'midnight',
    kind: 'theme',
    name: 'Midnight Slate',
    blurb: 'The default indigo-on-navy studio look.',
    price: 0,
    swatch: ['#0b0f19', '#818cf8', '#243252'],
  },
  {
    id: 'cyberpunk',
    kind: 'theme',
    name: 'Cyberpunk Neon',
    blurb: 'Electric teal on deep circuit blue.',
    price: 0,
    swatch: ['#090d16', '#00f5d4', '#1e2a47'],
  },
  {
    id: 'emerald',
    kind: 'theme',
    name: 'Emerald Zen',
    blurb: 'Calm green, easy on long sessions.',
    price: 0,
    swatch: ['#07130e', '#34d399', '#1b4233'],
  },
  {
    id: 'daylight',
    kind: 'theme',
    name: 'Daylight',
    blurb: 'Clean light mode for bright rooms.',
    price: 120,
    swatch: ['#f4f6fb', '#4f46e5', '#c2cade'],
  },
  {
    id: 'oceanic',
    kind: 'theme',
    name: 'Oceanic',
    blurb: 'Cool cyan drifting over deep water.',
    price: 140,
    swatch: ['#06141d', '#38bdf8', '#123449'],
  },
  {
    id: 'sakura',
    kind: 'theme',
    name: 'Sakura Dusk',
    blurb: 'Soft rose over twilight plum.',
    price: 180,
    swatch: ['#150b14', '#f472b6', '#3b1f37'],
  },
  {
    id: 'amber',
    kind: 'theme',
    name: 'Amber Forge',
    blurb: 'Warm ember glow on charred bronze.',
    price: 180,
    swatch: ['#140d06', '#f59e0b', '#3d2510'],
  },
  {
    id: 'crimson',
    kind: 'theme',
    name: 'Crimson Pact',
    blurb: 'Blood red against near-black.',
    price: 220,
    minLevel: 3,
    swatch: ['#120709', '#fb7185', '#3b1220'],
  },
  {
    id: 'slate',
    kind: 'theme',
    name: 'Monochrome',
    blurb: 'No colour, no distractions.',
    price: 240,
    minLevel: 4,
    swatch: ['#0e1013', '#cbd5e1', '#2a2f37'],
  },
  {
    id: 'royal',
    kind: 'theme',
    name: 'Royal Gold',
    blurb: 'Violet and gilt, for the grandmasters.',
    price: 320,
    minLevel: 6,
    swatch: ['#0f0a1c', '#fbbf24', '#2e1d54'],
  },
  {
    id: 'matrix',
    kind: 'theme',
    name: 'Terminal',
    blurb: 'Phosphor green on pure black.',
    price: 400,
    minLevel: 8,
    swatch: ['#000000', '#22c55e', '#0d2b16'],
  },
]

export const DIGITS: Cosmetic[] = [
  {
    id: 'classic',
    kind: 'digits',
    name: 'Orbitron',
    blurb: 'The default geometric numerals.',
    price: 0,
    swatch: ['#818cf8'],
  },
  {
    id: 'rounded',
    kind: 'digits',
    name: 'Rounded',
    blurb: 'Softer, friendlier figures.',
    price: 90,
    swatch: ['#38bdf8'],
  },
  {
    id: 'mono',
    kind: 'digits',
    name: 'Typewriter',
    blurb: 'Monospaced, like newsprint sudoku.',
    price: 110,
    swatch: ['#34d399'],
  },
  {
    id: 'serif',
    kind: 'digits',
    name: 'Classic Serif',
    blurb: 'Bookish numerals with real weight.',
    price: 130,
    minLevel: 3,
    swatch: ['#fbbf24'],
  },
]

export const CONFETTI: Cosmetic[] = [
  {
    id: 'classic',
    kind: 'confetti',
    name: 'Carnival',
    blurb: 'The standard multicolour burst.',
    price: 0,
    swatch: ['#4da3ff', '#35b57f', '#ffd24d', '#ff5470'],
  },
  {
    id: 'neon',
    kind: 'confetti',
    name: 'Neon Pulse',
    blurb: 'Hot magenta and electric cyan.',
    price: 70,
    swatch: ['#00f5d4', '#ff2e97', '#7c3aed', '#22d3ee'],
  },
  {
    id: 'gold',
    kind: 'confetti',
    name: 'Gold Rush',
    blurb: 'A shower of bullion.',
    price: 110,
    swatch: ['#fbbf24', '#f59e0b', '#fde68a', '#d97706'],
  },
  {
    id: 'aurora',
    kind: 'confetti',
    name: 'Aurora',
    blurb: 'Northern lights in slow motion.',
    price: 150,
    minLevel: 5,
    swatch: ['#34d399', '#22d3ee', '#a78bfa', '#f0abfc'],
  },
]

export const ALL_COSMETICS: Cosmetic[] = [...THEMES, ...DIGITS, ...CONFETTI]

export function cosmeticById(id: string, kind: CosmeticKind): Cosmetic | undefined {
  return ALL_COSMETICS.find((c) => c.id === id && c.kind === kind)
}

export function confettiColors(id: string): string[] {
  return cosmeticById(id, 'confetti')?.swatch ?? CONFETTI[0].swatch
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

const KEY = 'sudoku_cosmetics_v1'
const LEGACY_THEME_KEY = 'sudoku_theme'

export interface Inventory {
  owned: string[]
  equipped: Record<CosmeticKind, string>
}

const FREE_IDS = ALL_COSMETICS.filter((c) => c.price === 0).map((c) => `${c.kind}:${c.id}`)

function defaults(): Inventory {
  return {
    owned: [...FREE_IDS],
    equipped: { theme: 'midnight', digits: 'classic', confetti: 'classic' },
  }
}

export function key(kind: CosmeticKind, id: string): string {
  return `${kind}:${id}`
}

export function loadInventory(): Inventory {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Inventory>
      const base = defaults()
      const owned = Array.isArray(parsed.owned)
        ? Array.from(new Set([...FREE_IDS, ...parsed.owned.filter((o) => typeof o === 'string')]))
        : base.owned
      const equipped = { ...base.equipped, ...(parsed.equipped || {}) }
      // Never leave something equipped that is not owned (e.g. after an edit).
      for (const kind of ['theme', 'digits', 'confetti'] as CosmeticKind[]) {
        if (!owned.includes(key(kind, equipped[kind]))) equipped[kind] = base.equipped[kind]
      }
      return { owned, equipped }
    }
    // Carry over the theme the player had already chosen.
    const legacy = localStorage.getItem(LEGACY_THEME_KEY)
    const base = defaults()
    if (legacy && THEMES.some((t) => t.id === legacy && t.price === 0)) {
      base.equipped.theme = legacy
    }
    return base
  } catch {
    return defaults()
  }
}

export function saveInventory(inv: Inventory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(inv))
    // Kept in sync so the pre-React inline theme (if any) stays correct.
    localStorage.setItem(LEGACY_THEME_KEY, inv.equipped.theme)
  } catch (e) {
    console.error('Failed to save cosmetics', e)
  }
}

export function isOwned(inv: Inventory, c: Cosmetic): boolean {
  return c.price === 0 || inv.owned.includes(key(c.kind, c.id))
}

export type PurchaseResult =
  | { ok: true; inventory: Inventory; coins: number }
  | { ok: false; reason: 'owned' | 'level' | 'coins' }

/** Buy and immediately equip. Coins are debited through the economy module. */
export function purchase(c: Cosmetic): PurchaseResult {
  const inv = loadInventory()
  if (isOwned(inv, c)) return { ok: false, reason: 'owned' }

  const wallet = loadWallet()
  if (c.minLevel && levelFromXp(wallet.xp).level < c.minLevel) return { ok: false, reason: 'level' }

  const after = spend(c.price)
  if (!after) return { ok: false, reason: 'coins' }

  const next: Inventory = {
    owned: [...inv.owned, key(c.kind, c.id)],
    equipped: { ...inv.equipped, [c.kind]: c.id },
  }
  saveInventory(next)
  return { ok: true, inventory: next, coins: after.coins }
}

/** Fold server-held entitlements into the local inventory after reconciling. */
export function mergeServerEntitlements(items: string[]): Inventory {
  const inv = loadInventory()
  const owned = Array.from(new Set([...inv.owned, ...items.filter((i) => typeof i === 'string')]))
  const next: Inventory = { ...inv, owned }
  saveInventory(next)
  return next
}

export function equip(c: Cosmetic): Inventory {
  const inv = loadInventory()
  if (!isOwned(inv, c)) return inv
  const next: Inventory = { ...inv, equipped: { ...inv.equipped, [c.kind]: c.id } }
  saveInventory(next)
  return next
}
