import { memo, useState } from 'react'
import {
  CONFETTI,
  DIGITS,
  THEMES,
  equip,
  isOwned,
  purchase,
  type Cosmetic,
  type CosmeticKind,
  type Inventory,
} from '../lib/cosmetics'
import { sound } from '../lib/audio'
import {
  IconClose,
  IconCheck,
  IconSparkles,
  IconCoin,
  IconLock,
  IconPalette,
  IconNumbers,
  IconConfetti,
} from './Icons'

export interface ShopModalProps {
  inventory: Inventory
  coins: number
  level: number
  onInventoryChange: (inv: Inventory) => void
  onCoinsChange: (coins: number) => void
  onClose: () => void
  /** Which tab to open on, e.g. when entered from the theme button. */
  initialTab?: CosmeticKind
}

const TABS: { kind: CosmeticKind; label: string; Icon: typeof IconPalette; items: Cosmetic[] }[] = [
  { kind: 'theme', label: 'Themes', Icon: IconPalette, items: THEMES },
  { kind: 'digits', label: 'Numerals', Icon: IconNumbers, items: DIGITS },
  { kind: 'confetti', label: 'Win Effects', Icon: IconConfetti, items: CONFETTI },
]

function ShopModal({
  inventory,
  coins,
  level,
  onInventoryChange,
  onCoinsChange,
  onClose,
  initialTab = 'theme',
}: ShopModalProps) {
  const [tab, setTab] = useState<CosmeticKind>(initialTab)
  const [flash, setFlash] = useState<string | null>(null)

  const items = TABS.find((t) => t.kind === tab)?.items ?? []

  const handleBuy = (c: Cosmetic) => {
    const res = purchase(c)
    if (!res.ok) {
      setFlash(
        res.reason === 'coins'
          ? `Not enough coins for ${c.name}.`
          : res.reason === 'level'
            ? `${c.name} unlocks at Level ${c.minLevel}.`
            : null
      )
      sound.playError()
      return
    }
    sound.playWinFanfare()
    setFlash(`${c.name} unlocked and equipped.`)
    onInventoryChange(res.inventory)
    onCoinsChange(res.coins)
  }

  const handleEquip = (c: Cosmetic) => {
    sound.playSelect()
    setFlash(null)
    onInventoryChange(equip(c))
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card shop-card" onClick={(e) => e.stopPropagation()}>
        <header className="stats-header">
          <div className="modal-title">
            <IconSparkles size={22} color="var(--accent)" />
            <h2>Cosmetics Shop</h2>
          </div>
          <div className="shop-head-right">
            <span className="shop-balance" title="Your coin balance">
              <IconCoin size={14} /> {coins}
            </span>
            <button className="stats-close-btn" onClick={onClose} aria-label="Close shop">
              <IconClose size={20} />
            </button>
          </div>
        </header>

        <div className="achieve-tabs">
          {TABS.map((t) => {
            const ownedCount = t.items.filter((i) => isOwned(inventory, i)).length
            return (
              <button
                key={t.kind}
                type="button"
                className={`achieve-tab ${tab === t.kind ? 'achieve-tab-active' : ''}`}
                onClick={() => {
                  setTab(t.kind)
                  setFlash(null)
                }}
              >
                <t.Icon size={14} /> {t.label} ({ownedCount}/{t.items.length})
              </button>
            )
          })}
        </div>

        {flash && <div className="shop-flash">{flash}</div>}

        <div className="shop-grid">
          {items.map((c) => {
            const owned = isOwned(inventory, c)
            const equipped = inventory.equipped[c.kind] === c.id
            const levelLocked = Boolean(c.minLevel && level < c.minLevel)
            const affordable = coins >= c.price

            return (
              <div
                key={c.id}
                className={`shop-item ${equipped ? 'shop-equipped' : ''} ${
                  !owned && levelLocked ? 'shop-locked' : ''
                }`}
              >
                <div className="shop-swatch" aria-hidden="true">
                  {c.swatch.map((colour, i) => (
                    <span key={i} style={{ background: colour }} />
                  ))}
                </div>

                <div className="shop-item-body">
                  <div className="shop-item-head">
                    <h4>{c.name}</h4>
                    {equipped && (
                      <span className="shop-tag shop-tag-on">
                        <IconCheck size={11} /> Equipped
                      </span>
                    )}
                    {!equipped && owned && <span className="shop-tag">Owned</span>}
                  </div>
                  <p className="shop-blurb">{c.blurb}</p>

                  {owned ? (
                    <button
                      className="btn sub-btn shop-action"
                      onClick={() => handleEquip(c)}
                      disabled={equipped}
                    >
                      {equipped ? 'In use' : 'Equip'}
                    </button>
                  ) : levelLocked ? (
                    <button className="btn sub-btn shop-action" disabled>
                      <IconLock size={13} /> Level {c.minLevel}
                    </button>
                  ) : (
                    <button
                      className={`btn shop-action ${affordable ? 'btn-primary' : 'sub-btn'}`}
                      onClick={() => handleBuy(c)}
                      disabled={!affordable}
                      title={affordable ? undefined : `Need ${c.price - coins} more coins`}
                    >
                      <IconCoin size={13} /> {c.price}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="shop-footer">
          Coins come from solving puzzles — harder tiers and flawless finishes pay more.
        </p>
      </div>
    </div>
  )
}

export default memo(ShopModal)
