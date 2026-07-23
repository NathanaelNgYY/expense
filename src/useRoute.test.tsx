import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatHash } from './router'
import { goBack, navigate, replaceRoute, useRoute } from './useRoute'

function Probe() {
  const route = useRoute()
  return <span data-testid="route">{formatHash(route)}</span>
}

function currentProbe() {
  return screen.getByTestId('route').textContent
}

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRoute', () => {
  it('reads the hash the page loaded on', () => {
    window.location.hash = '#/insights'
    render(<Probe />)

    expect(currentProbe()).toBe('#/insights')
  })

  it('falls back to home when the hash is absent', () => {
    render(<Probe />)

    expect(currentProbe()).toBe('#/home')
  })

  it('re-renders when the hash changes underneath it', () => {
    // A hand-typed URL, or the OS back gesture: both surface as `hashchange`.
    render(<Probe />)

    act(() => {
      window.location.hash = '#/history'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(currentProbe()).toBe('#/history')
  })

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Probe />)

    unmount()

    expect(remove).toHaveBeenCalledWith('hashchange', expect.any(Function))
  })
})

describe('navigate', () => {
  it('pushes a history entry so back can return here', () => {
    const push = vi.spyOn(window.history, 'pushState')
    render(<Probe />)

    act(() => navigate({ tab: 'settings', sub: 'appearance' }))

    expect(push).toHaveBeenCalledTimes(1)
    expect(currentProbe()).toBe('#/settings/appearance')
  })

  it('is a no-op when already on the target route', () => {
    // Guards against the tab bar stacking duplicate entries on repeat taps.
    window.location.hash = '#/history'
    const push = vi.spyOn(window.history, 'pushState')
    render(<Probe />)

    act(() => navigate({ tab: 'history', sub: null }))

    expect(push).not.toHaveBeenCalled()
    expect(currentProbe()).toBe('#/history')
  })
})

describe('replaceRoute', () => {
  it('swaps the current entry instead of adding one', () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    render(<Probe />)

    act(() => replaceRoute({ tab: 'add', sub: null }))

    expect(replace).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(currentProbe()).toBe('#/add')
  })

  it('notifies subscribers even though replaceState fires no hashchange', () => {
    render(<Probe />)

    act(() => replaceRoute({ tab: 'insights', sub: null }))

    expect(currentProbe()).toBe('#/insights')
  })

  it('preserves the quick-add query string', () => {
    // The iOS Shortcuts widget points at ?add=true&amount=; normalising the route
    // must not drop the params AddEntry reads for its prefill.
    window.history.replaceState(null, '', '/?add=true&amount=5.80')
    render(<Probe />)

    act(() => replaceRoute({ tab: 'add', sub: null }))

    expect(window.location.search).toBe('?add=true&amount=5.80')
    expect(currentProbe()).toBe('#/add')
  })
})

describe('goBack', () => {
  it('pops the history stack when there is something to pop', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<Probe />)
    act(() => navigate({ tab: 'settings', sub: null }))
    act(() => navigate({ tab: 'settings', sub: 'data' }))

    act(() => goBack())

    expect(back).toHaveBeenCalledTimes(1)
  })

  it('walks up to the parent when deep-linked cold with nothing to pop', () => {
    // #/settings/poker opened straight from a link: history.back() would leave the
    // app entirely, so climb the route tree instead.
    window.location.hash = '#/settings/poker'
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1)
    render(<Probe />)

    act(() => goBack())

    expect(back).not.toHaveBeenCalled()
    expect(currentProbe()).toBe('#/settings')
  })

  it('never tries to exit the app from a top-level tab with no history', () => {
    window.location.hash = '#/insights'
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1)
    render(<Probe />)

    act(() => goBack())

    expect(back).not.toHaveBeenCalled()
    expect(currentProbe()).toBe('#/insights')
  })
})
