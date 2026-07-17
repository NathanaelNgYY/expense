# N3 — Commitment and safe-to-spend clarity

**Date:** 2026-07-17
**Status:** Decision complete; implementation in progress
**Backlog item:** N3 in `docs/PROJECT_IMPROVEMENT_STATUS.md`

## Product diagnosis

### Who this is for

The primary user is the owner, a Singapore intern managing a S$1,200 monthly income on an
iPhone. The dashboard is glance-heavy: its central job is to answer whether a purchase is safe
without requiring a trip into History.

### Pain

The dashboard currently mixes two concepts:

- The personal pass and monthly ring total every entry, including Savings and Investments, then
  describe that total as money “spent.”
- “Safe to spend today” also subtracts Savings and Investments from monthly income, even though
  those categories are displayed elsewhere as commitments.

This makes the daily number depend on when commitment transfers are logged. Before a planned
S$400 savings transfer is recorded, the dashboard temporarily presents that S$400 as spendable.
After it is recorded, the ring calls the transfer spending. Both states are misleading.

### Why now

N3 is the next audited backlog item, and N2 has made budget configuration reactive. The existing
approved custom-category design already contains the intended rule: Savings and Investments are
commitments, custom categories are spend categories, and safe-to-spend uses the spendable envelope
total rather than monthly income.

### Ten-star version

A future cash-flow model could separately show income, planned commitments, completed commitments,
and discretionary spending progress. That would make timing and funding status explicit, but it
would require a larger data model and more dashboard surface.

### MVP decision

Restore the established envelope semantics without changing stored data:

1. `Safe to spend today` uses Lunch + Transport + Buffer + budgeted custom categories.
2. Savings and Investments entries are excluded from the spend deducted from that amount.
3. The personal monthly total remains visible, but is described as **allocated**, not **spent**,
   because it includes both expenses and completed commitments.
4. Shared-budget copy remains **spent** because shared entries are expenses against a shared limit.

### Anti-goals

- No persistence, entry-schema, or category-type migration.
- No change to category deficits or Buffer behavior.
- No forecast card and no new dashboard section.
- No Dashboard/History file split.

### Success criteria

- Adding or removing a Savings/Investments entry does not change safe-to-spend.
- A budgeted custom category increases the spendable envelope; an unbudgeted custom category does
  not, while its entries still reduce safe-to-spend.
- Personal allocation summaries do not label commitments as spending.
- Shared-budget summaries retain spending language.

## Risks and resolution

If configured category totals do not equal monthly income, safe-to-spend follows the explicit
spendable envelopes rather than inferring `income - commitments`. This matches the existing budget
editor warning and the previously approved custom-category behavior: the configured envelopes are
the user's stated plan.

## Recommendation

**Go.** This is a small correction that restores an already documented product decision, removes a
timing-dependent dashboard number, and requires no data migration.
