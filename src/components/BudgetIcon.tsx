import {
  CircleDollarSign,
  PiggyBank,
  ShieldCheck,
  ShoppingBag,
  TrainFront,
  TrendingUp,
  Utensils,
} from 'lucide-react'
import type { Category } from '../types'

export type BudgetIconName = Category | 'buffer' | 'uncategorized'

interface Props {
  name: BudgetIconName
}

export default function BudgetIcon({ name }: Props) {
  const Icon =
    name === 'lunch'
      ? Utensils
      : name === 'transport'
        ? TrainFront
        : name === 'savings'
          ? PiggyBank
          : name === 'investments'
            ? TrendingUp
            : name === 'others'
              ? ShoppingBag
              : name === 'buffer'
                ? ShieldCheck
                : CircleDollarSign

  return <Icon className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
}
