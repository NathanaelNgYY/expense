# Product

## Register

product

## Platform

web

## Users

Three people: the owner (an intern in Singapore tracking a S$1,200/month budget) plus two
shared-budget members. All use it on iPhones as an installed PWA, mostly one-handed, in
short frequent bursts — logging a lunch right after paying, checking "can I still spend
today" before a purchase, reviewing poker P&L after a session. Most entries arrive
automatically (Apple Pay / DBS-email iOS Shortcuts), so screen time is glance-heavy.

## Product Purpose

A mobile-first expense tracker: log spend, see category budgets (Lunch, Transport, Savings,
Investments, Others), a computed monthly buffer that absorbs overages, and a spend
forecast/safe-to-spend figure. Also supports shared budgets between multiple people and a
"Poker" session ledger. Success = the user trusts the numbers enough to make a spend
decision from the dashboard without digging into History.

## Brand Personality

Classy wallet. Calm, tactile, premium — leather-and-felt green, gold foil accents, serif
money numerals. Money treated as something physical and composed, not gamified or corporate.
Big, unambiguous numbers; quiet confidence — the app never nags.

## Anti-references

- Generic fintech dashboards: navy-and-blue SaaS palettes, KPI card grids, corporate chart
  walls. This is a wallet, not a bank portal.
- A cluttered spreadsheet-in-app-clothing.
- Overly playful/cutesy (no mascot illustrations) — trust in numbers, not delight for its
  own sake.

## Design Principles

1. **The number is the interface.** Amount, category spend, and safe-to-spend read
   instantly, not after parsing a chart.
2. **Fast entry above all.** Add Entry is a numpad-first flow; nothing may add taps to the
   log-an-expense path (manual or auto-ingested).
3. **The wallet feel is the identity.** Gold-on-felt, serif numerals, iOS grouped lists.
   Alternate themes restyle tokens; they never restructure the visual language. Dark by
   default — sharpen it, don't abandon it for a light SaaS look.
4. **Familiar iOS grammar.** Grouped lists, segmented controls, back-chevron navigation —
   HIG as inspiration. Users should never have to learn a custom affordance.
5. **Honest about state.** Offline cache, sync lag, and instant-vs-explicit saves are told
   to the user plainly (save bars, sync notes), never hidden.

## Accessibility & Inclusion

WCAG AA contrast minimum, especially for the red/green/amber budget-state colors (don't
rely on hue alone — pair with the icons/labels already in place). Respect
`prefers-reduced-motion`. ≥44px touch targets; primary actions in one-handed thumb reach.
