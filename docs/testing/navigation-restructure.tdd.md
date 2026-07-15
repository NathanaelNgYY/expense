# Five-tab navigation restructure — TDD record

**Date:** 2026-07-15
**Scope:** Promote History, Insights, and Settings to primary navigation while retaining Poker and Shared budgets as secondary tools.

## Acceptance criteria

1. Primary navigation contains exactly Home, History, Add, Insights, and Settings, in that order.
2. History keeps transaction search, filters, editing, deletion, and its calendar; monthly and weekly analysis lives on Insights.
3. Settings exposes Poker tracker and Shared budgets under a clearly labelled More tools section.
4. Opening either secondary tool keeps the tab bar visible and Settings selected, with a named route back.
5. All five tab targets measure at least 44 by 44 pixels, fit 375×667 and 390×844 without horizontal overflow, and pass the existing Axe WCAG A/AA scan.
6. Initial JavaScript and CSS remain within the existing 143 KiB and 12 KiB gzip budgets.

## RED

Commit `17d65d2` added user-visible tests before implementation. The focused suite failed because the Insights module and destination did not exist, Settings was not a tab, Poker and Shared budgets were still primary tabs, analytics still rendered in History, and Settings had no More tools routes.

## GREEN

Commit `0c6d26e` introduced the five-tab shell, a lazy Insights screen, Settings tool drill-downs, and moved weekly/month pattern presentation out of History without changing the underlying calculations. The focused suite passed 44 tests across TabBar, App, Dashboard, History, Insights, and Settings.

## Browser and accessibility verification

- Nine mobile Chromium journeys pass, including the exact five-tab order, both Settings tool routes, persistent Settings selection, keyboard tab order, 44px primary targets, and no horizontal overflow at 390×844.
- Axe reports no WCAG A/AA violations across Home, Add, History, Insights, Settings, Poker tracker, Shared budgets, and Automatic tracking.
- Visual captures at 375×667 and 390×844 confirmed the Original Dark hierarchy, fixed bottom navigation, readable category/weekly cards, and scrollable Settings content.
- Initial payload remains within budget: 136.9 KiB gzip JavaScript and 12.0 KiB gzip CSS.

The local Supabase connection errors printed during E2E are expected fixture behavior: browser tests intentionally block deployed Supabase and exercise the offline cache.
