import type { CSSProperties } from 'react'
import { formatSGD } from '../format'

interface Props {
  allocated: number
  total: number
}

export default function BudgetUsageRing({ allocated, total }: Props) {
  const percentage = total > 0 ? Math.max(0, Math.round((allocated / total) * 100)) : 0
  const visualPercentage = Math.min(100, percentage)
  const style = { '--budget-progress': `${visualPercentage}%` } as CSSProperties

  return (
    <div
      className="budget-usage-ring"
      role="img"
      aria-label={`${percentage}% of monthly income allocated`}
      style={style}
    >
      <span className="budget-usage-ring__inner">
        <strong>{percentage}%</strong>
        <small>
          {formatSGD(allocated)} / {formatSGD(total)}
        </small>
      </span>
    </div>
  )
}
