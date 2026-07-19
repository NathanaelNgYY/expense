import { useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { useBudgetConfig } from '../BudgetConfigContext'
import { entriesForMonth } from '../compute'
import { formatMoney } from '../format'
import { entryNetAmount } from '../shared/entryAmount'
import {
  CURATED_CURRENCIES,
  currencyName,
  entriesForCurrency,
  normalizeCurrencyCode,
} from '../shared/currency'
import { sgtToday } from '../shared/sgtDate'
import { makeCustomCategoryId } from '../storage'
import type { CurrencyCode, Entry, WalletSnapshot } from '../types'

interface Props {
  entries: Entry[]
  requestedCurrency?: CurrencyCode | null
  onRequestedCurrencyHandled?: () => void
  alwaysShow?: boolean
  disabled?: boolean
}

type View = 'wallets' | 'create'

export default function CurrencyWalletMenu({
  entries,
  requestedCurrency = null,
  onRequestedCurrencyHandled,
  alwaysShow = false,
  disabled = false,
}: Props) {
  const {
    activeCurrency,
    currencies,
    wallets,
    setActiveCurrency,
    createWallet,
  } = useBudgetConfig()
  const [open, setOpen] = useState(() => Boolean(requestedCurrency))
  const [view, setView] = useState<View>(() => requestedCurrency ? 'create' : 'wallets')
  const [currency, setCurrency] = useState(() => requestedCurrency ?? '')
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [copyStructure, setCopyStructure] = useState(true)
  const [customCode, setCustomCode] = useState('')

  const availableCurrencies = useMemo(
    () => CURATED_CURRENCIES.filter(option => !currencies.includes(option.code)),
    [currencies],
  )

  function close() {
    setOpen(false)
    setView('wallets')
    if (requestedCurrency) onRequestedCurrencyHandled?.()
  }

  function beginCreate() {
    setCurrency(availableCurrencies[0]?.code ?? '')
    setCustomCode('')
    setMonthlyAmount('')
    setCopyStructure(true)
    setView('create')
  }

  function handleCreate() {
    const code = normalizeCurrencyCode(currency === '__custom' ? customCode : currency)
    if (!code || wallets[code]) return
    const source = wallets[activeCurrency]
    const config = {
      monthlyIncome: Number(monthlyAmount) || 0,
      lunch: 0,
      transport: 0,
      savings: 0,
      investments: 0,
      buffer: 0,
      others: 0,
    }
    const snapshot: WalletSnapshot = copyStructure
      ? {
          config,
          overrides: { ...source.overrides },
          customCategories: source.customCategories.map(category => ({
            ...category,
            id: makeCustomCategoryId(category.label),
            budget: null,
          })),
        }
      : { config, overrides: {}, customCategories: [] }
    createWallet(code, snapshot)
    close()
  }

  const now = sgtToday()
  const totals = Object.fromEntries(currencies.map(code => {
    const monthEntries = entriesForMonth(
      entriesForCurrency(entries, code),
      now.getFullYear(),
      now.getMonth(),
    )
    return [code, monthEntries.reduce((sum, entry) => sum + entryNetAmount(entry), 0)]
  }))
  const selectedCode = currency === '__custom' ? normalizeCurrencyCode(customCode) : normalizeCurrencyCode(currency)
  const canCreate = Boolean(selectedCode && !wallets[selectedCode] && Number(monthlyAmount) >= 0)

  return (
    <>
      {(alwaysShow || currencies.length >= 2) && (
        <button
          type="button"
          className="wallet-switcher-trigger"
          aria-label={`Switch currency wallet, currently ${activeCurrency}`}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => {
            setView('wallets')
            setOpen(true)
          }}
        >
          {activeCurrency}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div className="wallet-sheet-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) close()
        }}>
          <section className="wallet-sheet" role="dialog" aria-modal="true" aria-labelledby="wallet-sheet-title">
            <div className="wallet-sheet__handle" aria-hidden="true" />
            <header className="wallet-sheet__header">
              <div>
                <span className="wallet-sheet__eyebrow">Personal budgets</span>
                <h2 id="wallet-sheet-title">{view === 'wallets' ? 'Switch wallet' : 'Add a currency'}</h2>
              </div>
              <button type="button" className="wallet-sheet__close" aria-label="Close" onClick={close}>
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            {view === 'wallets' ? (
              <div className="wallet-sheet__list">
                {currencies.map(code => (
                  <button
                    type="button"
                    className={`wallet-row${code === activeCurrency ? ' wallet-row--active' : ''}`}
                    key={code}
                    onClick={() => {
                      setActiveCurrency(code)
                      close()
                    }}
                  >
                    <span className="wallet-row__mark" aria-hidden="true">{code === activeCurrency && <Check size={16} />}</span>
                    <span className="wallet-row__copy">
                      <strong>{currencyName(code)}</strong>
                      <small>{code}</small>
                    </span>
                    <span className="wallet-row__total">{formatMoney(totals[code] ?? 0, code)} spent</span>
                  </button>
                ))}
                <button type="button" className="wallet-add-row" onClick={beginCreate}>
                  <Plus size={18} aria-hidden="true" />
                  Add currency
                </button>
              </div>
            ) : (
              <form className="wallet-create" onSubmit={event => { event.preventDefault(); handleCreate() }}>
                <label>
                  <span>Currency</span>
                  <select value={currency} onChange={event => setCurrency(event.target.value)}>
                    {availableCurrencies.map(option => (
                      <option key={option.code} value={option.code}>{option.code} — {option.name}</option>
                    ))}
                    <option value="__custom">Enter another code…</option>
                  </select>
                </label>
                {currency === '__custom' && (
                  <label>
                    <span>Three-letter currency code</span>
                    <input
                      value={customCode}
                      maxLength={3}
                      autoCapitalize="characters"
                      placeholder="NZD"
                      onChange={event => setCustomCode(event.target.value.toUpperCase())}
                    />
                  </label>
                )}
                <label>
                  <span>Monthly amount</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={monthlyAmount}
                    placeholder="0"
                    onChange={event => setMonthlyAmount(event.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>Category setup</legend>
                  <label className="wallet-create__choice">
                    <input type="radio" checked={copyStructure} onChange={() => setCopyStructure(true)} />
                    <span><strong>Copy from {activeCurrency}</strong><small>Keep labels and icons; enter new amounts later.</small></span>
                  </label>
                  <label className="wallet-create__choice">
                    <input type="radio" checked={!copyStructure} onChange={() => setCopyStructure(false)} />
                    <span><strong>Start with standard categories</strong><small>Create a clean wallet.</small></span>
                  </label>
                </fieldset>
                <p className="wallet-create__note">No amounts or transactions will be converted.</p>
                <button className="save-btn" type="submit" disabled={!canCreate}>Create wallet</button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}
