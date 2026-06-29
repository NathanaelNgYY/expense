import { CircleDollarSign } from 'lucide-react'
import { ICON_COMPONENTS } from './budgetIcons'

interface Props {
  name: string
}

export default function BudgetIcon({ name }: Props) {
  const Icon = ICON_COMPONENTS[name] ?? CircleDollarSign
  return <Icon className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
}
