import type { ReactElement } from 'react'
import { render as testingLibraryRender, type RenderOptions } from '@testing-library/react'
import { BudgetConfigProvider } from './BudgetConfigContext'

// Test-only barrel: the Fast Refresh component-export restriction does not apply here.
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'

export function render(ui: ReactElement, options?: RenderOptions) {
  return testingLibraryRender(<BudgetConfigProvider>{ui}</BudgetConfigProvider>, options)
}
