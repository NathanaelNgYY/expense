import { useMemo, useState } from 'react'
import { CheckCircle, ChevronLeft, Wallet, WalletCards } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { formatSGDWhole } from '../format'
import { useBudgetConfig } from '../BudgetConfigContext'
import { DEFAULT_BUDGET, type BudgetConfig } from '../types'
import { completeBudgetOnboarding } from './onboardingState'
import './FirstRunBudgetOnboarding.css'

type Step = 'welcome' | 'budget' | 'ready'
type Destination = 'home' | 'add'
type EditableKey = 'monthlyIncome' | 'lunch' | 'transport' | 'savings' | 'investments'

interface Props {
  onFinish: (destination: Destination) => void
}

const POCKETS: Array<{ key: Exclude<EditableKey, 'monthlyIncome'>; label: string }> = [
  { key: 'lunch', label: 'Lunch' },
  { key: 'transport', label: 'Transport' },
  { key: 'savings', label: 'Savings' },
  { key: 'investments', label: 'Investments' },
]

function initialDraft(): Record<EditableKey, string> {
  return {
    monthlyIncome: String(DEFAULT_BUDGET.monthlyIncome),
    lunch: String(DEFAULT_BUDGET.lunch),
    transport: String(DEFAULT_BUDGET.transport),
    savings: String(DEFAULT_BUDGET.savings),
    investments: String(DEFAULT_BUDGET.investments),
  }
}

function amount(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export default function FirstRunBudgetOnboarding({ onFinish }: Props) {
  const { saveConfig } = useBudgetConfig()
  const [step, setStep] = useState<Step>('welcome')
  const [draft, setDraft] = useState(initialDraft)

  const config = useMemo<BudgetConfig>(() => {
    const monthlyIncome = amount(draft.monthlyIncome)
    const lunch = amount(draft.lunch)
    const transport = amount(draft.transport)
    const savings = amount(draft.savings)
    const investments = amount(draft.investments)
    const buffer = monthlyIncome - lunch - transport - savings - investments
    return { monthlyIncome, lunch, transport, savings, investments, buffer, others: buffer }
  }, [draft])

  const isValid = config.monthlyIncome > 0 && config.buffer >= 0
  const everyday = config.lunch + config.transport
  const future = config.savings + config.investments

  function update(key: EditableKey, value: string) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  function acceptPlan(next: BudgetConfig) {
    saveConfig(next)
    completeBudgetOnboarding()
    setStep('ready')
  }

  function finish(destination: Destination) {
    completeBudgetOnboarding()
    onFinish(destination)
  }

  return (
    <section className="screen onboarding" aria-label="Budget setup">
      {step === 'welcome' && (
        <>
          <header className="onboarding__brand-bar">
            <div className="onboarding__wordmark">
              <span className="onboarding__brand-mark"><WalletCards aria-hidden="true" /></span>
              <span>Budget</span>
            </div>
            <button type="button" className="onboarding__quiet-action" onClick={() => acceptPlan(DEFAULT_BUDGET)}>
              Use defaults
            </button>
          </header>

          <div className="onboarding__welcome-copy">
            <p className="onboarding__welcome-label">Welcome — let’s start with your plan</p>
            <h1>Make your monthly money plan yours.</h1>
            <p>
              Start with the amounts that matter today. You can change every target later in Settings.
            </p>
          </div>

          <div className="onboarding__plan-summary">
            <span>Monthly plan</span>
            <strong>{formatSGDWhole(DEFAULT_BUDGET.monthlyIncome)}</strong>
            <small>Current default · editable next</small>
          </div>

          <footer className="onboarding__actions">
            <button type="button" className="save-btn" onClick={() => setStep('budget')}>
              Set up my budget
            </button>
            <small>No account required</small>
          </footer>
        </>
      )}

      {step === 'budget' && (
        <>
          <header className="onboarding__nav">
            <button type="button" onClick={() => setStep('welcome')} aria-label="Back to welcome">
              <ChevronLeft aria-hidden="true" />
            </button>
            <h1>Your pockets</h1>
            <span>2 / 3</span>
          </header>

          <label className="onboarding__total">
            <span>Total monthly plan</span>
            <span className="onboarding__money-input">
              <b>S$</b>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={draft.monthlyIncome}
                onChange={event => update('monthlyIncome', event.target.value)}
                aria-label="Total monthly plan"
              />
            </span>
          </label>

          <div className="onboarding__pockets">
            {POCKETS.map(({ key, label }) => (
              <label key={key}>
                <span className="onboarding__pocket-label">
                  <BudgetIcon name={key} />
                  <span><strong>{label}</strong><small>Monthly target</small></span>
                </span>
                <span className="onboarding__pocket-amount">
                  <span>S$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={draft[key]}
                    onChange={event => update(key, event.target.value)}
                    aria-label={`${label} target`}
                  />
                </span>
              </label>
            ))}
            <div className="onboarding__buffer-row">
              <span className="onboarding__pocket-label">
                <BudgetIcon name="buffer" />
                <span><strong>Buffer</strong><small>Fills itself</small></span>
              </span>
              <strong>{formatSGDWhole(config.buffer)}</strong>
            </div>
          </div>

          {!isValid && (
            <p className="onboarding__error" role="alert">
              Your targets are over the monthly plan. Lower a target or raise the total.
            </p>
          )}

          <footer className="onboarding__actions">
            <button type="button" className="save-btn" disabled={!isValid} onClick={() => acceptPlan(config)}>
              Close my wallet
            </button>
          </footer>
        </>
      )}

      {step === 'ready' && (
        <>
          <header className="onboarding__brand-bar">
            <div className="onboarding__wordmark onboarding__wordmark--plain">
              <Wallet aria-hidden="true" />
              <span>Budget</span>
            </div>
            <button type="button" className="onboarding__quiet-action" onClick={() => setStep('budget')}>
              Repack
            </button>
          </header>

          <div className="onboarding__receipt">
            <div className="onboarding__receipt-head">
              <span>MONTHLY WALLET</span>
              <CheckCircle aria-hidden="true" />
            </div>
            <h1>{formatSGDWhole(config.monthlyIncome)}</h1>
            <dl>
              <div><dt>Lunch + transport</dt><dd>{formatSGDWhole(everyday)}</dd></div>
              <div><dt>Savings + investments</dt><dd>{formatSGDWhole(future)}</dd></div>
              <div><dt>Automatic buffer</dt><dd>{formatSGDWhole(config.buffer)}</dd></div>
            </dl>
            <p>Ready for this month</p>
          </div>

          <p className="onboarding__ready-copy">Log one expense to see each pocket update.</p>

          <footer className="onboarding__actions">
            <button type="button" className="save-btn" onClick={() => finish('add')}>
              Add my first expense
            </button>
            <button type="button" className="onboarding__secondary-action" onClick={() => finish('home')}>
              Go to Home
            </button>
          </footer>
        </>
      )}
    </section>
  )
}
