import { formatSGDWhole } from '../../format'

export interface BudgetPass {
  id: string
  title: string
  subtitle: string
  amount: number | null
  limit: number | null
  pct: number
  usageLabel: 'allocated' | 'spent'
}

interface Props {
  passes: BudgetPass[]
  onSelect: (id: string) => void
}

export default function BudgetPassStack({ passes, onSelect }: Props) {
  return (
    <>
      <div className="pass-stack" style={{ height: `${168 + (passes.length - 1) * 22}px` }}>
        {passes.map((pass, depth) => {
          const loaded = pass.amount !== null
          const capped = loaded && pass.limit !== null && pass.limit > 0
          const remaining = capped ? pass.limit! - pass.amount! : null
          const overspent = remaining !== null && remaining < 0

          return (
            <div
              key={pass.id}
              className="pass"
              style={{
                transform: `translateY(${depth * 22}px) scale(${1 - depth * 0.04})`,
                opacity: depth === 0 ? 1 : 1 - depth * 0.25,
                zIndex: passes.length - depth,
              }}
            >
              <div className="pass-title">{pass.title}</div>
              <div className="pass-subtitle">{pass.subtitle}</div>
              {!loaded ? (
                <div className="pass-amt">Tap to open</div>
              ) : capped ? (
                <>
                  <div className="pass-amt-label">{overspent ? 'Over budget by' : 'Left to spend'}</div>
                  <div className={`pass-amt ${overspent ? 'pass-amt--over' : ''}`}>
                    {formatSGDWhole(Math.abs(remaining!))}
                  </div>
                </>
              ) : (
                <>
                  <div className="pass-amt-label">Spent this month</div>
                  <div className="pass-amt">{formatSGDWhole(pass.amount!)}</div>
                </>
              )}
              <div className="progress-bar pass-bar">
                <div
                  className="progress-fill"
                  style={overspent ? { width: '100%', background: 'var(--red)' } : { width: `${pass.pct}%` }}
                />
              </div>
              {capped && (
                <div className="pass-meta">
                  {formatSGDWhole(pass.amount!)} of {formatSGDWhole(pass.limit!)} {pass.usageLabel}
                </div>
              )}
              {depth !== 0 && (
                <button
                  type="button"
                  className="pass-tap-veil"
                  onClick={() => onSelect(pass.id)}
                  aria-label={`Switch to ${pass.title}`}
                />
              )}
            </div>
          )
        })}
      </div>
      {passes.length > 1 && <p className="stack-hint muted">tap a card behind to bring it forward</p>}
    </>
  )
}
