import {
  BookOpen, Car, CircleDollarSign, Coffee, Dumbbell, Gamepad2, Gift, Heart,
  Home, PawPrint, Phone, PiggyBank, Plane, ShieldCheck, Shirt, ShoppingBag,
  Stethoscope, TrainFront, TrendingUp, Utensils, Zap,
  type LucideIcon,
} from 'lucide-react'

// Icons offered to the user when creating a custom category.
export const CUSTOM_ICON_NAMES = [
  'ShoppingBag', 'Coffee', 'Gift', 'Heart', 'Home', 'Car', 'Plane', 'Dumbbell',
  'Gamepad2', 'Shirt', 'Stethoscope', 'BookOpen', 'Phone', 'Zap', 'PawPrint', 'CircleDollarSign',
] as const

// Every icon name (built-in + custom) that BudgetIcon can render.
export const ICON_COMPONENTS: Record<string, LucideIcon> = {
  // built-in budget lines
  lunch: Utensils, transport: TrainFront, savings: PiggyBank,
  investments: TrendingUp, others: ShoppingBag, buffer: ShieldCheck,
  // curated custom set
  ShoppingBag, Coffee, Gift, Heart, Home, Car, Plane, Dumbbell,
  Gamepad2, Shirt, Stethoscope, BookOpen, Phone, Zap, PawPrint, CircleDollarSign,
}

interface Props {
  name: string
}

export default function BudgetIcon({ name }: Props) {
  const Icon = ICON_COMPONENTS[name] ?? CircleDollarSign
  return <Icon className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
}
