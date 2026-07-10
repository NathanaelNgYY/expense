# Budget Tracker: Product, Competitor, and App Store Analysis (2026)

**Research date:** 10 July 2026

**Product inspected:** the current `budget-tracker` repository, its tests, documentation, Supabase migrations, Netlify functions, Obsidian design notes, and the supplied mockups.
**Important scope statement:** the product that exists today is a React/Vite progressive web app (PWA). The proposed SwiftUI/SwiftData/CloudKit app in `docs/APP_STORE.md` has not been started. Mockups are design intent, not evidence that a flow is implemented.

## Executive conclusion

The current app is useful as a personal PWA, but it is **not ready for a public App Store launch**. It has a good fast-entry core, unusually thoughtful offline mutation handling, Singapore-time calculations, learned merchant categorisation, CSV portability, and a working shared-budget subsystem. It also has major product gaps (no onboarding, income transactions, recurring transactions, reminders, goals, search/filtering, full backup, or coherent deletion flow) and public-launch blockers (no native iOS target, no privacy policy or App Store artefacts, a shared bearer token protecting all personal entries, permissive runtime payload handling, silent sync failures, and three different persistence/privacy models).

The strongest realistic direction is not “another complete finance dashboard.” It is:

> **A private, Singapore-first daily spending companion: a trustworthy “safe to spend today” number, with near-zero-effort capture from a user-configured Wallet automation and fast PayNow/statement fallback. No bank login.**

That direction is credible, but the central technical assumption remains unproven: Apple documents a Wallet **Transaction** automation trigger and allows it to run automatically, but its public documentation does not promise the exact merchant/amount variables exposed on the target Singapore iOS/card combination. That must be tested on physical devices before a native rewrite is committed.

### Readiness score

**Public App Store candidate: 42/100 — blocked.** There is no native binary, the current financial-data model is unsuitable for public multi-user distribution, and launch-critical onboarding/privacy/deletion/accessibility paths are absent. The current PWA is considerably more mature as a personal/internal tool: all 294 tests pass and the production build succeeds.

---

# Part 1 — What the app actually has

## 1. Current feature inventory

| Current capability | What it does and code evidence | Completeness / flow quality | Limitations, edge cases, and competitor context | Low-complexity improvement |
|---|---|---|---|---|
| Manual expense entry | A numpad-first amount flow, optional category and note, and Personal/Shared destination. See `src/screens/AddEntry.tsx:15-25`, `:45-98`, `:100-224`. | **Good core.** Saving a personal entry is immediate and offline-durable. | It records expenses only—not income, transfers, refunds, accounts, merchants, or recurring schedules. Date is always today in the main Add flow. Dime, Money Manager, Buddy, Spendee and Wallet support richer transaction types. | Keep the default flow as-is; add a small Expense/Income toggle and a “more” drawer for date/merchant only when needed. Do not put account selection in the default path unless accounts become a real product concept. |
| Backdated entry | History includes a “missed expense” form with date, amount, category, and note. See `src/screens/History.tsx:183-199` and `:289-392`. | **Implemented but duplicated.** | It creates a second entry UI with different controls and more cognitive load. | Reuse one transaction editor component in “quick” and “full” modes. |
| Transaction editing | Tapping a History row opens an editor for date, amount, category and note. See `src/screens/History.tsx:201-240`, `:456-568`. | **Functional.** | No visible delete action in History. Old categorised entries disappear from the Dashboard’s 14-day expandable lists, so users may be unable to delete an old individual entry without resetting an entire month. Competitors consistently provide edit, split, bulk edit, and delete from the transaction detail. | Add Delete with confirmation to the History edit panel. Add Undo after deletion. |
| Transaction deletion | Dashboard category rows support inline confirmation. See `src/screens/Dashboard.tsx:165-217`. | **Partial and misplaced.** | Categorised Dashboard lists are restricted to the last 14 days (`Dashboard.tsx:328-335`). History—the natural ledger—is edit-only. | Put delete in History; keep Dashboard deletion only as a shortcut. |
| Monthly category budgets | Settings has monthly income, built-in budget buckets, custom category budgets, rename/icon overrides, and a total mismatch warning. See `src/screens/Settings.tsx:533-708`. | **Substantial.** | This is a target-vs-spend tracker, not true zero-based/envelope budgeting. No rollover, payday cycle, future month, fixed-cost reservation, or per-month override. Custom categories add budget targets without automatically reconciling the buffer. YNAB/Actual/Goodbudget are much stronger for allocation; Copilot/Buddy are stronger for flexible cycles. | Clarify the model in onboarding: “monthly spending targets.” Add payday-cycle start and optional rollover only after demand. |
| Category management | Built-ins can be renamed/re-iconed; custom categories can be added, budgeted, edited, and removed only if unused. See `src/storage.ts:51-80`, `src/screens/Settings.tsx:125-230`. | **Good for a small app.** | Automated insights in `compute.ts` still operate primarily on built-in `CATEGORIES`, so custom categories can be missing from “most expensive” and month comparison. | Generalise insights to `allCategoryIds(custom)` and add a merge/re-tag flow for deleting used categories. |
| Dashboard | Shows personal/shared pass cards, month spend, safe-to-spend today, buffer, category progress, uncategorised triage, and recent category entries. See `src/screens/Dashboard.tsx:54-151`, `:220-417`. | **Useful but crowded.** | It presents overlapping concepts: spent, income, safe/day, buffer, categories, and a shared-budget card stack. “Safe to spend” is derived from income minus all entries, not from known fixed future costs (`compute.ts:268-284`). Competitors win either through one strong decision number (Copilot “Free to Spend”) or a configurable dashboard (Monarch), not both simultaneously. | Make “safe to spend today” the hero; demote buffer and shared switching. Explain the formula and show “includes/excludes” details. |
| Safe to spend | Remaining monthly income divided by inclusive days remaining. See `src/compute.ts:227-235`, `:268-284`. | **Implemented, easy to understand.** | It calls monthly income a budget, assumes a calendar month, and ignores upcoming recurring bills. It clamps only in the UI; negative internal results remain possible. Copilot explicitly separates expected recurrings; Rocket’s payday view attempts pay-cycle modelling but reviews report algorithm overrides and variable-income problems. | Rename input to “monthly spend limit” or change the formula. Add pay-cycle configuration and reserved recurring costs later. |
| Buffer | A computed bucket absorbs “Others” spending and category overages. See `src/compute.ts:105-115`. | **Distinctive but under-explained.** | `others` and `buffer` are coupled in storage (`src/storage.ts:35-48`), creating conceptual ambiguity. Users can edit totals into inconsistent states. | Explain buffer once during setup; show why it changed. Consider removing “Others” as a budget alias and treating uncategorised separately. |
| History and analytics | Month navigation, weekly bars, month total, weekly lunch pace, entry list, and month-review insights. See `src/screens/History.tsx:115-176`, `:411-568`; `src/components/InsightsSection.tsx`. | **Broad but correctness needs work.** | `weeklyBudget = monthlyIncome / 4` is inaccurate in most months (`History.tsx:138`). “Highest spending day” only considers lunch (`compute.ts:167-179`). “Day pattern” uses all entries, not the selected month (`InsightsSection.tsx:33-35`). Built-in-only comparisons ignore custom/uncategorised spend. These are trust-breaking in a finance app. | Fix the four calculation/scoping bugs before adding new charts. Add chart accessibility summaries. |
| Automatic capture via Shortcuts | `POST /api/ingest` accepts Apple Pay-shaped data or raw DBS alert email, normalises it, learns categories from corrections and deduplicates. See `netlify/functions/lib/ingestHandler.ts:7-59`, `src/shared/category.ts`, `src/shared/dedupe.ts`. | **Technically thoughtful, setup-heavy.** | The user must manually build/configure the automation and paste the bearer token. Public Apple docs confirm the trigger, not the exact fields. Network failure is possible mid-payment and Shortcuts error recovery is limited. | Create a guided setup with screenshots/video, a copied template shortcut where possible, a “send test transaction” verifier, and a visible capture receipt. Never promise silent setup. |
| Learned categorisation | Known merchant/payee history beats keyword rules; unknowns remain uncategorised. | **One of the best current design choices.** | Matching quality depends on merchant normalisation; personal names/merchant variants can fragment history. The keyword list is code-bound. Competitors provide rules and review queues; Monarch/Copilot apply rules historically. | Add merchant normalisation and user-visible “always categorise this merchant as…” rules. Keep unknowns explicit. |
| Offline-first writes | Optimistic local cache, durable mutation queue, tombstones and pending-create reconciliation against eventually consistent Netlify Blobs. See `src/EntriesContext.tsx:30-67`, `:95-131`, `:154-185`. | **Strong implementation.** | All failures are swallowed (`EntriesContext.tsx:57-59`, `:128-130`); users see no offline/sync state. A wrong token can leave the UI looking healthy while never syncing. | Add a small state indicator: Saved on device / Syncing / Sync failed. Provide Retry and token guidance. |
| CSV import/export | Round-trippable transaction CSV with validation and duplicate-ID skipping. See `src/csvEntries.ts` and `src/screens/Settings.tsx:245-283`, `:721-744`. | **Good for entries.** | It does not back up budget settings, category definitions, themes, poker sessions, shared budgets, or credentials. It is not a full backup. | Rename to “Export transactions.” Add a versioned full local backup (JSON) separately. Keep transaction export free. |
| Shared budgets | Google/Supabase auth, budget creation/join codes, roles, shared categories and entries, member tools, realtime entry updates. See `src/sharedBudgets/` and `supabase/migrations/`. | **Large, tested subsystem.** | It adds accounts, third-party data processing, privacy/deletion obligations, online dependency, and prominent navigation complexity. Any member can edit/delete any entry by design. Category and attribution integrity need stronger database constraints. | Keep it out of the first public build unless interviews show demand. If retained, separate personal/private and shared products clearly and add audit history. |
| Themes | Runtime theme provider/picker with multiple visual systems. | **Implemented and tested.** | Themes are polish, not retention. They enlarge CSS and build size; the JS bundle is 521.72 kB minified and triggers a chunk warning. | Keep one excellent light/dark system for launch; move extra themes to later paid cosmetic value. |
| Poker ledger | Local poker sessions and analytics. | **Implemented but product-incoherent.** | It confuses positioning, occupies a fifth tab, is not covered by transaction export, and introduces gambling-adjacent review questions. Apple’s real-money gaming rule does not automatically make a private ledger a gambling app, but it creates avoidable reviewer ambiguity. | Remove from the public budget app; keep a private build or separate app. |

## 2. Requested flow audit

### Onboarding — **absent / launch blocker**

`App.tsx:15-18` chooses only Home or Add from the URL and immediately renders the app. There is no first-run setup, explanation of the budgeting model, data/privacy choice, notification timing, or Shortcuts verification. This is especially damaging because monthly income defaults to S$1,200 and the product’s differentiator requires a multi-step system automation.

Minimum onboarding should ask only:

1. Pay-cycle start and monthly/allowance spend limit.
2. Student / NS / working (used only to propose defaults).
3. Whether to set up automatic Wallet capture now or use manual entry.
4. A test transaction that proves setup worked.

Do not request notifications on first launch. Ask after the user sees the value of capture confirmation or weekly recap.

### Navigation — **clear labels, excessive product scope**

The five permanent tabs are Home, Add, History, Poker and Shared (`src/components/TabBar.tsx:4-63`). Home/Add/History are coherent. Poker and Shared compete with the core daily job and force a dense tab bar. Settings is hidden behind a Home icon rather than a tab, which is acceptable, but shared-budget settings are then mixed into the personal settings screen.

Recommended launch navigation: **Today / Add / History**, with Settings from Today. Shared can become an optional top-level mode later.

### Transaction entry speed — **good, not yet best-in-class**

Strengths: amount-first, custom numpad, optional category, immediate optimistic save, `?add=true` deep link. Weaknesses: category is not preselected from merchant/history for manual entries, note has no merchant suggestions, and the main flow cannot change date. Dime adds home quick actions, widgets, Siri, reminders, recurring entries and suggestions; those are the relevant speed benchmark, not heavyweight bank-connected apps.

### Dashboard usefulness — **valuable number, too many secondary concepts**

The “safe to spend today” number is the best decision aid. It should not be presented as more accurate than it is: current calculation excludes no future bills and treats the calendar month as the pay cycle. The supplied home mockup is visually strong, but it does not exactly match the current component tree and should be treated as design exploration.

### Budget creation — **settings form, not guided creation**

There is no “create a budget” flow. Users edit defaults in Settings. The mismatch warning is helpful but does not explain whether targets should sum to income, whether savings entries are spending, or how buffer works. Competitors with complex methods invest heavily in onboarding because this is where abandonment starts.

### Category management — **strong basics, analytics mismatch**

Blocking deletion of a category in use prevents orphaned entries. However, this is also a dead end: users must manually re-tag every old entry. Provide merge/re-tag before delete. Generalise insights to custom categories.

### Editing and deleting — **edit good; delete fragmented**

Editing belongs in History and works. Deleting belongs there too but does not exist. Add delete + undo in the edit panel and use the same transaction detail everywhere.

### Search, sorting and filtering — **absent**

History is fixed to descending date within a selected month. There is no search by merchant/note/amount, category filter, source filter, uncategorised filter, or sort choice. This becomes essential once users have a few months of imported data. Start with one search box and chips for category/source; do not build a query-builder UI.

### Recurring transactions — **absent**

No schedule model, upcoming bills, subscription detection, or generated entries exists. This limits safe-to-spend accuracy. A lightweight recurring schedule is more valuable than more charts, but should follow core trust fixes.

### Notifications — **absent**

There is no notification permission flow, local reminder, weekly recap, overspend alert, or capture confirmation in current code. Useful notifications are: capture succeeded/needs category, weekly recap, and an optional budget threshold. Generic “remember to log” notifications should be opt-in and adaptive.

### Data visualisation — **good breadth, several correctness defects**

The app has rings, bars, progress indicators, comparisons and insights, but calculations noted above must be corrected. A finance chart with the wrong scope is worse than no chart. Text summaries are more important than another visual.

### Accessibility — **promising semantics, not verified**

Positive evidence includes button semantics, `aria-label`, `aria-live` for amount, keyboard handling for expandable cards and explicit empty/error status roles. Missing evidence: automated axe audit, VoiceOver walkthrough, Dynamic Type-equivalent browser zoom testing, 44pt target audit, chart spoken summaries, contrast verification across every theme, and reduced-motion coverage outside the amount animation. The mockups use small secondary text and a crowded bottom bar; verify on a physical iPhone.

### Empty states — **inconsistent**

Poker and History have clear empty messages. Dashboard categories say “No expenses in the last 2 weeks”; shared flows have loading/error text. There is no helpful first-use Home state explaining how to add the first transaction or set a real budget.

### Error handling — **good in shared flows, weak in personal sync**

CSV and Supabase errors are surfaced. Personal fetch/flush failures are deliberately silent, and Add navigates away immediately. The backend also accepts structurally unsafe payloads at runtime: `entries.ts:37-46` parses JSON but does not validate amount, date, note, category or permitted update fields. A malicious or buggy client can create negative/NaN-like/invalid records or alter fields not intended by the UI.

### Privacy and security — **not suitable for public distribution in current form**

- Personal entries are all protected by one `INGEST_TOKEN`, stored in browser `localStorage` (`src/api.ts:3-20`) and visible in the user-editable Shortcut.
- There is no per-user identity or tenancy for Netlify Blobs. Sharing/leaking the token grants CRUD access to the entire personal ledger.
- The in-memory per-IP limiter (`netlify/functions/lib/rateLimit.ts`) is per warm serverless instance, not a durable distributed limit.
- Personal financial entries live on Netlify; shared financial entries and identity live on Supabase; budgets/categories/themes/poker/token live locally. Users cannot form one accurate mental model of where their data is.
- Supabase tables do enable RLS and later migrations move policy helpers to `private`, revoke broad function execution, and grant RPCs to authenticated users—good work. However, policies omit explicit `TO authenticated`, and shared entry/category integrity relies on the client. Add constraints/triggers so `category_id` belongs to the same `budget_id`, and prevent direct clients from changing entry attribution unexpectedly. Supabase recommends explicit grants, RLS on exposed tables, role-scoped policies, and both `USING` and `WITH CHECK` for ownership-sensitive updates ([RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security), [API security](https://supabase.com/docs/guides/api/securing-your-api)).
- There is no checked-in privacy policy, account-deletion flow, or full “Delete all data” path.

### Local data, cloud, backup and export — **fragmented**

| Data | Current location | Sync/backup reality |
|---|---|---|
| Personal entries | Netlify Blobs + localStorage cache | Server is source of truth; CSV covers entries only. |
| Mutation queue/tombstones | localStorage | Device/browser-profile only. |
| Budget config, categories | localStorage | No cloud sync; not in CSV. |
| API token | localStorage | No secure keychain; user must recreate. |
| Poker data | localStorage | No export/backup. |
| Themes | localStorage | No meaningful need to back up, but not synced. |
| Shared budgets/profile | Supabase | Account-backed online data; separate deletion/privacy model. |

This is the most important non-visual architecture weakness. Either ship a local-first native product with an optional Apple sync story, or ship a proper account-backed product. Do not keep three models in a public v1.

### Singapore localisation — **currency/date aware, not truly localised**

Strengths: `S$`, `en-SG`, SGD, SGT-local date helpers, DBS email parsing, and local merchant keywords. Missing: flexible pay cycles, NS allowance/student presets, PayNow/PayLah capture, local bank statement formats, merchant aliases (hawker/Grab/MRT/NTUC), GST-aware receipt parsing if receipts are added, and localisation as a configurable content pack rather than hard-coded strings. Personal entries have a `currency` field but the UI and budget math assume SGD.

### App Store readiness — **not started**

There are no Swift files, Xcode project, StoreKit configuration, privacy manifest/policy, App Store metadata, native widgets, App Intents, notification implementation, CloudKit schema, deletion flow, TestFlight evidence, CI workflow or release/rollback process. The PWA build is healthy, but Apple’s guideline 4.2 requires an app to go beyond a repackaged website and make meaningful use of platform capabilities ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). A minimal web wrapper is high-risk.

The repository’s existing copy rule (“never use advice/recommend/invest/returns”) is prudent positioning, not an Apple-documented word blacklist. More importantly, the current guideline text says apps used for financial trading, investing or money management should be submitted by the institution performing those services, and sensitive/highly regulated apps should be submitted by a legal entity. Many independent manual budget tools are on the store, but the literal text creates review uncertainty. Keep the app clearly framed as personal record-keeping—not banking, investing, advice, account aggregation, or money movement—and ask App Review for clarification before relying on an individual-account launch.

## 3. Verification results

- `npm test`: **40 files, 294 tests, all passed**.
- `npm run build`: **passed**; PWA generated successfully.
- `npm run lint`: **0 errors, 3 React hook dependency warnings** in AddEntry, Dashboard and Settings.
- Build warning: one JS chunk is **521.72 kB minified / 145.83 kB gzip**. Code splitting is advisable, particularly if Shared and Poker remain optional.
- No CI workflow was found. No live authenticated end-to-end test or physical-iPhone accessibility/Shortcuts test was available.

---

# Part 2 — Competitor comparison (2026)

## 1. Product and business comparison

Pricing and availability change by storefront. “Paid” below means a subscription is required after trial unless noted. Exact local prices should be rechecked in the Singapore App Store before marketing decisions.

| Competitor | Free / paid | Main audience | Core budgeting approach | Standout and genuinely useful features | Reports / collaboration | Major weakness | What this app currently lacks relative to it |
|---|---|---|---|---|---|---|---|
| **YNAB** | Paid after 34-day trial; US$109/year or US$14.99/month; eligible college students get a year trial | Users willing to learn an active budgeting method | Zero-based: give available money a job | Strong targets, debt/loan tools, reconciliation, education, file import, YNAB Together up to six | Mature reports; household sharing | Learning curve, credit-card model confusion, price; direct import limited to US/Canada/UK/EU | Real allocation, targets/rollover, reconciliation, income/accounts, education, complete household model. [Pricing/features](https://www.ynab.com/pricing/), [App Store reviews](https://apps.apple.com/us/app/ynab/id1010865877?see-all=reviews) |
| **Monarch Money** | Paid only after trial; subscription-funded and ad-free | US/Canada households wanting a complete finance hub | Flexible category/group or flex budgeting | Multiple data providers, review queue, rules, goals, net worth/investments, custom reports, Apple Card integration, unlimited collaborators | Excellent configurable reports and household collaboration | High/expanding price, setup depth, connection quality varies, some recurring split limitations | Accounts/net worth/goals, powerful rules, custom reports, review workflow, household polish. [Pricing](https://help.monarch.com/hc/en-us/articles/9136169422996-Pricing), [App Store](https://apps.apple.com/us/app/monarch-budget-track-money/id1459319842) |
| **Copilot Money** | Paid subscription after trial; price shown during onboarding | Apple-centric US users prioritising design and automation | Spend-category budgets; optional budgeting | Excellent visual design, ML suggestions after review, transaction inbox, recurring detection, investments, Free to Spend, Apple Card/Cash/Savings, Amazon/Venmo, widgets | Strong spend/cash-flow views; no mature household model | US financial institutions only; slow fixes/freezes and sync/search/report gaps reported | Transaction review inbox, recurring detection, account integrations, polished widgets, trend analysis. [2026 quick start](https://help.copilot.money/en/articles/11157550-quick-start-guide), [App Store](https://apps.apple.com/us/app/copilot-track-budget-money/id1447330651) |
| **Rocket Money** | Useful free tier; optional Premium with variable/sliding monthly price | US consumers focused on subscriptions/bills and cash flow | Category budgets plus payday/bill forecasting | Subscription detection/cancellation, bill negotiation, balance alerts, automated savings, credit score | Strong recurring/bill view; shared accounts Premium | Budget/payday prediction can override user truth; duplicates/double-counting and bill-service complaints; US-centric financial services | Subscription detection, upcoming bills, pay-cycle view, alerts; most other “save money for you” services are out of scope. [2026 pricing](https://help.rocketmoney.com/en/articles/2217739-how-much-does-rocket-money-cost), [reviews](https://apps.apple.com/us/app/rocket-money-bills-budgets/id1130616675?see-all=reviews) |
| **Spendee** | Free (1 wallet/1 budget); Plus/Premium subscriptions | Visual manual/bank-sync users and shared travel/household wallets | Wallets plus category budgets | Shared wallets, scheduled transactions, multiple currencies, import/export, bulk editing, receipt scan, Face ID | Attractive reports; shared wallets | Free limits; bank sync and duplicate/merged transaction complaints; subscription required for automation | Recurring schedules, multiple wallets/currencies, receipt import, biometric lock, bulk editing. [Pricing](https://www.spendee.com/pricing), [SG App Store](https://apps.apple.com/sg/app/money-tracker-by-spendee/id635861140) |
| **Wallet by BudgetBakers** | Free manual tier; Premium subscription or lifetime option | Power users, couples, travellers, multi-currency households | Flexible budgets, planned payments and accounts | 15,000+ claimed bank connections, multi-currency, planned payments, API/MCP, investments/net worth, group sharing, CSV/XLS/OFX | Deep analytics and sharing | Repeated bank/web sync, duplicate, sign-out and support complaints; extensive server/analytics data processing | Accounts, planned payments, multi-currency, richer import, API, goals, net worth. [Official product](https://budgetbakers.com/en/products/wallet/), [privacy](https://budgetbakers.com/en/privacy/), [reviews](https://apps.apple.com/us/app/wallet-daily-budget-profit/id1032467659?see-all=reviews) |
| **Money Manager (Realbyte)** | Free with ads; one-time paid/ad-removal options vary | Manual trackers and accounting-minded users | Account ledger/double-entry plus category budgets | Excellent filtering/calendar, receipt photos, recurring entries, accounts/assets/liabilities, multi-currency, rich charts | Detailed charts; weak real-time collaboration | Dated UI, setup complexity, poor cross-device sync, accessibility complaints | Income/accounts/transfers, recurring, search/filter, receipts, double-entry, asset tracking. [Official features](https://realbyteapps.com/), [reviews](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810?see-all=reviews) |
| **Buddy** | Free/basic with subscription for advanced/bank features; local prices vary | Young users and couples who want approachable budgeting | Flexible cycles including biweekly, category plan | Very fast manual entry, shared budgets, multiple accounts, customisation, bank import in supported regions | Friendly insights; couple sharing | Missed/duplicate transactions, stale balances, merchant categorisation learning requests, bank coverage varies | Pay-cycle budgets, accounts, recurring entries, mature shared UX. [Official site](https://buddy.download/home/), [reviews](https://apps.apple.com/us/app/buddy-budget-planner-app/id936422955?see-all=reviews) |
| **Goodbudget** | Free limits; Premium US$10/month or US$80/year | Couples/families who like envelopes | Envelope budgeting | Rollover/sinking funds, debt tracking, reconciliation, shared devices, scheduled transactions; US bank sync in Premium | Useful envelope/debt reports and family sync | Dated/cumbersome interface, goals difficult to reuse, bank sync US-only | Envelopes/rollover, reconciliation, scheduled items, debt/goals, method guidance. [Pricing](https://goodbudget.com/signup), [reviews](https://apps.apple.com/us/app/goodbudget-budget-planner/id471112395?see-all=reviews) |
| **Dime** | Free; listing says no paywall/ads, optional IAP listing exists | iPhone users wanting a beautiful manual tracker | Simple category budgets and custom pay-cycle frames | iCloud sync, recurring/future entries, reminders, Face ID, quick actions, widgets, Siri, Dynamic Type, undo, CSV; built by a solo student | Clean insights; no household collaboration | No bank sync; widget/time-zone/recurring bugs have appeared; small support capacity | Native speed/integration, recurring, reminders, widgets, Siri, iCloud, biometrics, undo, income. [App Store](https://apps.apple.com/us/app/dime-budget-expense-tracker/id1635280255) |
| **Actual Budget** | Free/open source; hosting and bank providers may cost money | Privacy/self-hosting and envelope-budget enthusiasts | Envelope budgeting/local-first | Local-first, optional E2EE sync, rules, schedules, undo/redo, API, many file imports, ownership of data | Powerful reports; multi-user depends on deployment | Setup/hosting burden; official mobile use needs server/browser and bank sync is US/Canada/EU/UK-oriented | Rules, schedules, reconciliation/accounts, undo, full backup, genuine local-first ownership. [Official site](https://actualbudget.org/), [install matrix](https://actualbudget.org/docs/install/) |
| **DBS NAV Planner** | Free for DBS/POSB users | Singapore bank customers wanting consolidated planning | Bank-derived cash flow, category budgets and financial planning | Native DBS transaction categorisation, six-month spending, SGFinDex-linked assets/CPF/investments/loans | Broad wealth/cash-flow view; no independent couple budget | Locked to a bank ecosystem; broader wealth/sales agenda; not a fast private manual tracker | Automatic local-bank truth, CPF/SGFinDex and comprehensive assets—but these are not realistic parity targets. [DBS spending tools](https://www.dbs.com.sg/personal/mobile/sms/ya-savings-w2/index-3.html), [SGFinDex](https://www.sgfindex.gov.sg/) |
| **Dobin** | Free app; monetised partly through financial-product/reward discovery | Singapore users consolidating multiple banks/cards | Aggregated spend/cash-flow tracking | Local bank coverage, PDF statement import, strong categorisation, rewards/MCC, CSV export, encrypted backup | Cross-bank views | Not MAS-regulated by its own FAQ; connection refresh/credentials and security trust concerns; not real-time | Local statement import, Singapore bank coverage, rewards/MCC, full encrypted backup. [Official FAQ](https://www.dobin.io/faq/security-privacy), [SG reviews](https://apps.apple.com/sg/app/dobin-manage-your-money/id1661758471?see-all=reviews) |

**Singapore market note:** Seedly’s expense-tracking app was discontinued after 31 March 2026 and its tracking data was scheduled for deletion. That creates a real migration/positioning opportunity, but it also demonstrates that a widely known local brand did not consider the tracker worth maintaining. [Seedly discontinuation notice](https://seedly.sg/posts/important-update-seedly-app-discontinuation/).

## 2. Automation, import, export and privacy comparison

| Competitor | Automation / bank connection | Apple Pay or import support | Export / backup | Privacy model | Relevant gap/opportunity |
|---|---|---|---|---|---|
| YNAB | Direct import in selected US/CA/UK/EU banks; scheduled transactions/rules | File import; no general Singapore Apple Pay capture | Budget/data export | Account/cloud subscription; says it does not sell data | Singapore bank gap and method complexity leave room for a private lightweight product. |
| Monarch | Multiple US/Canada aggregators; transaction rules and recurring detection | Apple Card integration; Mint/CSV imports | Full transaction/balance export | Cloud account; subscription-funded, says no sale of financial data | Excellent review/rules pattern worth copying without copying aggregation. |
| Copilot | US aggregators; ML suggestions and name rules | FinanceKit-based Apple financial products in supported US context; Amazon/Venmo; CSV export on web | Transaction CSV | Cloud account and aggregators; paid/no ads, but privacy policy includes analytics/advertising disclosures | Design and transaction review are benchmarks; region restriction is an opening. |
| Rocket Money | US bank aggregation and service automation | Bank-derived import, not generic Wallet capture | Export availability/tier varies | Cloud, consumer-report/financial product ecosystem | Subscription cancellation is useful but operationally and regionally unsuitable for a solo SG launch. |
| Spendee | Premium bank sync, automatic categorisation, scheduled transactions | Receipt scanner and file import | Import/export and cloud backup | Cloud account with service providers | Shared travel wallet and receipt scan are useful later; sync reliability is a warning. |
| Wallet | Premium global bank sync, planned payments, API | CSV/XLS/OFX; no verified universal Apple Pay feed | Cloud sync and exports; server stores transaction details | GDPR/ISO claims; server storage plus analytics/Sentry/Mixpanel disclosed | Portable imports and multi-currency are valuable; “bank-level” marketing is not a differentiator by itself. |
| Money Manager | Primarily manual; recurring entries | Receipt photos and manual imports | Manual file/Excel-style backup; poor live sync | Primarily device/file oriented depending platform | Strong ledger tools create feature-bloat risk; copy search/filter/recurring, not double-entry by default. |
| Buddy | Manual plus supported-region bank imports | Bank imports; no verified general Apple Pay feed | Cloud/shared service; export details vary by tier | Account/cloud for linked/shared data | Pay-cycle flexibility and couple UX matter more than banking claims. |
| Goodbudget | Manual/scheduled; Premium US bank sync | File import | Account sync; history limits by tier | Cloud account; manual mode remains useful without bank link | Rollover/sinking-fund mental model is useful, but its onboarding/UI complaints show the cost of method complexity. |
| Dime | Manual, recurring/future entries, reminders, Siri/quick actions | No bank connection; native entry shortcuts | CSV plus iCloud sync | Device/iCloud-centric, no bank credentials | Closest direct product competitor. Your automation must be materially easier/more reliable than Dime’s manual-native experience. |
| Actual | Rules/schedules; optional GoCardless/SimpleFIN through server | QIF/OFX/QFX/CAMT/CSV | Full budget export and self-hosted backup | Local-first, optional self-hosted E2EE | “Own your data” is credible competition; your advantage must be iPhone/Singapore ease, not privacy wording alone. |
| DBS NAV | Direct first-party bank data + SGFinDex | DBS transactions; not general Apple Wallet import | Bank-controlled | Regulated bank environment | Cannot match data breadth; compete on simplicity, neutrality and no bank login. |
| Dobin | Local connection/refresh plus PDF statement import | PDF share/import; not Apple Pay history | CSV and password-protected encrypted backup | Cloud/device mix; explicit consent; says not MAS-regulated | PDF/CSV statement import is a realistic Singapore fallback worth prioritising. |

## 3. What recent reviews repeatedly say

This is a qualitative review of recent storefront samples surfaced by Apple and recent official/help/community material, not a statistically complete scrape of every review.

### Repeated complaints across products

1. **Bank sync breaks trust faster than it saves time.** Wallet, Spendee, Buddy, Rocket, YNAB and Copilot reviews mention stale, missing, merged or duplicated transactions, reconnect loops, slow updates or incorrect balances. This validates your dedupe/review approach and argues against promising “automatic” without a visible reconciliation state.
2. **Budget models override reality.** Rocket reviews complain that manually corrected paydays revert to algorithmic guesses. Goodbudget goal/envelope behaviour and YNAB credit cards require education. The product should let user corrections win permanently.
3. **Users pay for reduced mental arithmetic, not chart quantity.** Rocket’s payday-left view, Copilot’s Free to Spend, Goodbudget’s envelope balance and Dime’s simple monthly focus are repeatedly praised. Your safe-to-spend number is strategically sound if its inputs are honest.
4. **Pricing resentment rises when reliability falls.** Wallet/Spendee bank-sync failures, Monarch’s price, YNAB increases, and short trials are common objections. A low-cost/lifetime option fits students only after reliability is proven.
5. **Search, editable rules and transaction review matter at scale.** Copilot users request stronger search/rule management; Buddy users want merchant-category learning; Monarch users value historical rules and “needs review.” Your uncategorised triage is a good start but needs a real review inbox.
6. **Native polish and simplicity can beat feature breadth.** Dime reviews praise UX despite no bank sync; Money Manager reviews praise depth but criticise dated UI and accessibility; Goodbudget users struggle to find reports. A small native app can compete if every screen is fast and obvious.
7. **Data portability and recovery are trust features.** Wallet users report cross-platform/data recovery pain; Money Manager users want better sync; Actual’s ownership story is compelling. Export alone is not backup.

### Marketing features with low practical value for this product

- Generic AI chat about spending.
- “Financial personality” quizzes.
- Dozens of decorative themes before core accessibility.
- Credit score, investment quotes, rewards optimisation or net worth in the launch product.
- Bill negotiation/cancellation concierge outside the US.
- Receipt photo archives without a retrieval/reconciliation job.
- Social feeds, leaderboards, mascots or many badge types.
- An MCP/API merely to claim “AI integration.” Wallet can justify an API as a power-user platform; this app cannot yet.

---

# Part 3 — Feature-gap analysis

## 1. Priority and product value

| Classification | Feature | User problem solved | Competitors / evidence | Differentiation or parity | Difficulty / solo scope |
|---|---|---|---|---|---|
| **Essential before launch** | Correct calculations and unified transaction detail | Wrong or undeletable financial records destroy trust | Every serious competitor supports reliable detail/edit/delete | Parity, but existential | **Easy–Medium, 3–5 days.** Fix weekly divisor/scopes/custom categories; add delete + undo. Very realistic. |
| **Essential before launch** | First-run budget/pay-cycle onboarding | Defaults are wrong for almost everyone and buffer is unexplained | YNAB/Monarch/Copilot invest heavily in setup; reviews show complexity cost | Parity with a local/student angle | **Medium, 4–7 days.** Local state + 4 screens. Realistic. |
| **Essential before launch** | Visible sync/offline/error status | Users cannot know whether data is only local or safely synced | Sync complaints dominate competitor reviews | Trust differentiator if honest | **Medium, 3–5 days** for current PWA; native architecture changes it. Realistic. |
| **Essential before launch** | Runtime API validation or remove public backend | Corrupt/malicious payloads and one-token tenancy threaten financial data | All cloud competitors have identity/validation; Actual/Dime avoid the server | Parity/security; offline-native route differentiates | **Medium if hardening PWA, Hard if rewriting native.** Do not publicly launch current backend. |
| **Essential before launch** | Full delete + transaction export + privacy policy | Users need control and accurate disclosure | Apple privacy rules; Actual/Dime ownership positioning | Strong trust signal | **Medium, 3–7 days** after architecture settles. Realistic. |
| **Essential before launch** | Search + category/source filters | Users cannot find old imported entries | Money Manager, Monarch, Copilot, Wallet | Basic parity | **Easy, 2–3 days.** Client-side at current scale. |
| **Strong differentiator** | Guided Wallet Transaction automation with test/health check | Manual logging is abandoned; bank linking is distrusted/unsupported | Apple supports Transaction personal automation; no compared SG app leads with it | Genuine differentiator if setup works | **Medium–Hard, 1–3 weeks plus device testing.** Solo-realistic only after gate test. |
| **Strong differentiator** | Singapore merchant normalisation + correction rules | Local merchant strings are messy and PayNow names are ambiguous | Monarch/Copilot rules; Dobin local categorisation | Local differentiation, not just parity | **Medium, 1 week initial + ongoing fixture maintenance.** Realistic. |
| **Strong differentiator** | Accurate pay-cycle “safe today” with reserved bills | Monthly dashboards do not answer “can I spend this now?” | Copilot Free to Spend, Rocket payday view, Buddy cycles | Differentiates through simplicity/local pay cycles | **Medium, 1–2 weeks** with schedule model and tests. Realistic. |
| **Useful but not urgent** | Recurring schedules + subscription candidates | Fixed costs are forgotten and safe-to-spend is overstated | Nearly all major competitors; Dime supports manual recurrence | Parity; local/private detection can differentiate | **Medium, 1–2 weeks** for manual schedules; detection needs history/rules. Realistic. |
| **Useful but not urgent** | Weekly recap and capture confirmation | Automation is invisible; users forget to review | Rocket alerts, Dime reminders, Copilot dashboard/review | Small retention differentiator | **Easy–Medium, 3–5 days** native. Realistic. |
| **Useful but not urgent** | Full local backup/import | New phone/browser loss destroys config and history context | Actual, Dime, Dobin, Money Manager | Trust parity | **Easy–Medium, 2–4 days.** Versioned JSON + migration tests. |
| **Post-launch** | PayNow/PayLah screenshot or statement share import | Wallet trigger misses non-Apple-Pay payments | Dobin PDF import, Spendee receipt scan | Strong SG differentiation | **Medium–Hard, 2–4 weeks.** Share extension/document picker, Vision/PDF parsing, review UI. Solo-realistic with narrow bank fixtures. |
| **Post-launch** | Shared budgets in native CloudKit | Couples/travel groups need a common pot | Monarch, Spendee, Wallet, Buddy, Goodbudget | Mostly parity; privacy can differentiate | **Hard, 4–8+ weeks.** Sharing conflicts, roles, deletion, audit. Defer until demand. |
| **Post-launch** | Savings goals / sinking funds | Students need to reserve money for fees, travel, devices | YNAB, Monarch, Goodbudget, Rocket | Parity unless tied to allowance/pay cycle | **Medium, 1–2 weeks.** Realistic after core budget model settles. |
| **Unnecessary / bloat** | Bank aggregation at launch | Reduces manual entry but creates coverage, cost, compliance and support burden | Core of Monarch/Copilot/Rocket/Wallet; poor SG fit | Parity where a solo developer cannot win | **Hard and ongoing.** Paid provider, partnerships, consent/deletion/security/support. Not realistic for v1. |
| **Unnecessary / bloat** | AI chatbot, net worth, investments, credit score, social/gamification suite | Weakly connected to the daily capture/safe-spend job | Marketed by large suites | Commodity/brand dilution | **Medium–Hard with perpetual maintenance.** Avoid. |

## 2. Technical requirements, maintenance and edge cases

| Feature | Backend / database / platform / privacy requirements | Ongoing maintenance | Important edge cases |
|---|---|---|---|
| Correct ledger/detail | Shared transaction validator; calculation tests; transaction state machine if income/transfers added | Low | Refunds, negative corrections, deleted custom categories, future dates, month boundaries, DST when travelling, SGD rounding. |
| Onboarding/pay cycle | Persist onboarding version and pay-cycle rule; no backend required | Low; update defaults/content packs | 28–31 day months, last-day pay, biweekly allowance, mid-cycle install, irregular income, NS pay dates. |
| Sync/error status | Current queue needs status/error metadata and retry reason; native version needs CloudKit/local store states | Medium because providers fail | Wrong/expired token, conflicting edits, offline reset, reinstall, server write succeeds but response fails, long queue. |
| Secure public data model | Prefer SwiftData local store + optional CloudKit private DB; otherwise real user auth, per-user keys, schema validation, durable rate limits | High if server-backed; lower if local-first | Account deletion, token revocation, export, shared data, compromised device, migration rollback. |
| Search/filter | Local indexed fields; normalised merchant/note text | Low | Accents, merchant aliases, amounts with commas, custom categories, imported uncategorised entries. |
| Wallet automation | User-created Personal Automation; App Intent action exposed to Shortcuts; use current `supportedModes`, not deprecated `openAppWhenRun`; physical-device test | Medium: iOS UI/trigger changes and support docs | Trigger fields absent, declined/reversed/foreign-currency transactions, offline action, duplicate triggers, multiple cards, automation disabled, app deleted/reinstalled. |
| Merchant rules | Versioned local rules + user overrides; consider signed remote content only if privacy claim permits | Medium: collect anonymised fixtures only with explicit consent, or curate manually | `GRAB*`, aggregator prefixes, same merchant different business, PayNow personal names, multilingual strings, refunds. |
| Recurring/subscriptions | Schedule table and occurrence identity; local notification scheduling; detection can run on-device | Medium | Month-end dates, paused/cancelled subscriptions, price drift, annual plans, duplicate imported+generated entry, refunds/trials. |
| PayNow/statement import | User-initiated share/document import; on-device Vision/PDF parsing preferred; never upload by default | High parser maintenance per bank/template | Password-protected PDFs, DBS format changes, duplicate imports, pending vs posted, transfers, joint accounts, redacted screenshots, OCR decimals. |
| Shared budgets | CloudKit Share or hardened Supabase; roles, audit trail, conflict resolution, member removal, delete/export | High | Owner leaves, invite leak, offline concurrent edit, malicious member, mixed currencies, category deletion, account deletion. |
| Savings goals | Goal table linked to contributions, not just a decorative target | Low–Medium | Withdrawals, missed months, goal date change, shared goals, rollover, double counting with “Savings” expense category. |

---

# Part 4 — Apple Pay, Wallet, Shortcuts and import feasibility

## 1. What iOS currently allows

| Idea | Status in 2026 | What must be communicated honestly |
|---|---|---|
| Read all Apple Pay/Wallet transactions with ordinary PassKit | **Not generally available.** PassKit lets apps process their own Apple Pay payments and manage passes they are entitled to; it is not a universal purchase-history API. [PassKit overview](https://developer.apple.com/documentation/passkit) | Do not claim the app can silently read Wallet history. |
| FinanceKit financial transaction access | **Available only under strict conditions and not for Singapore launch.** Apple currently documents eligible Apple Card/Cash/Savings in the US and open-banking institutions in the UK. It requires a managed entitlement and organization-level Developer account. [FinanceKit eligibility](https://developer.apple.com/financekit/) | It is not a route to Singapore Apple Pay history for this student/individual launch. Revisit only if Apple expands region/eligibility. |
| Wallet Transaction Personal Automation | **Technically supported.** Apple documents a Transaction trigger “When I tap” for selected cards. [Transaction trigger](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios) | The user must create and enable the automation. Apple’s public page does not guarantee the exact merchant/amount/card/timestamp variables; device-test them. |
| Run Transaction automation without asking | **Supported when configured by the user.** Transaction is on Apple’s list of automations that can run automatically. [Automation settings](https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/9.0/ios/26) | The app cannot silently create or enable the personal automation. Individual actions may still need automation-compatible settings. |
| Call an app action without foregrounding the app | **Supported through App Intents, subject to supported execution modes.** App Intents exposes actions to Shortcuts. The old `openAppWhenRun` property is deprecated; use supported modes in current SDKs. [App Intents](https://developer.apple.com/documentation/appintents/app-intents), [`openAppWhenRun` deprecation](https://developer.apple.com/documentation/appintents/appintent/openappwhenrun) | Update `docs/APP_STORE.md`; do not build new code around a deprecated property. Verify SwiftData/CloudKit writes from the chosen intent mode and shared container. |
| Read other apps’ notifications | **Not a general iOS capability.** UserNotifications manages notifications sent to your own app. A new accessory-forwarding framework is limited to companion accessories and EU installations—not a finance-app inbox listener. [UserNotifications](https://developer.apple.com/documentation/usernotifications), [Accessory Notifications limits](https://developer.apple.com/documentation/accessorynotifications) | Do not propose an Android-style notification listener. |
| Trigger from bank email/message | **Possible through a user-created Shortcuts communication automation.** Apple documents sender/subject/account criteria for Email and sender/content criteria for Message, and these trigger types can run automatically. [Communication triggers](https://support.apple.com/my-mm/guide/shortcuts/apdd711f9dff/9.0/ios/26) | The app itself is not reading the inbox. The user configures a narrow automation and explicitly passes content. Test whether each bank’s message/email exposes enough body text. |
| CSV/statement import | **Fully possible and low policy risk when user initiated.** | Prefer documented templates, preview, dedupe and undo. Never treat imported pending and posted transactions as automatically distinct without rules. |
| Receipt/email parsing | **Possible.** Share extension/document picker + on-device OCR/parser is the privacy-friendliest route. Server email access requires OAuth scopes, privacy disclosure, deletion and security. | Start with user-shared screenshots/PDFs. Avoid requesting Gmail/Outlook access in v1. |
| Automatic categorisation | **Possible on-device** with deterministic rules, merchant history and optional local ML. | Let corrections override predictions, expose confidence, and never silently map unknowns to “Others.” |

## 2. Bank integration and open banking reality in Singapore

- **SGFinDex is not a public indie aggregation API.** Its current consumer flow sends consented data to participating financial planning applications operated by banks, insurers and listed government services. It names DBS NAV Planner, OCBC OneView, UOB One View and similar participants—not arbitrary App Store apps. [SGFinDex participant FAQ](https://www.sgfindex.gov.sg/faq).
- A commercial aggregator could provide connections, but this creates per-user cost, vendor contracts, privacy/security obligations, deletion/support workflows and constant broken-connection work. It also weakens the “no bank login/no server” position.
- Dobin demonstrates local demand and offers both connections and PDF statement import, but says it is not MAS-regulated. Its reviews show both the value of local categorisation and user discomfort when connections are not OAuth-style.
- The realistic solo-developer sequence is **manual + Wallet automation → CSV/PDF statement imports → only then evaluate a paid aggregator after real demand and unit economics are known**.

## 3. Better Shortcuts onboarding

1. Explain the privacy model and limitation in one sentence: “You choose a Wallet automation; it sends only the transaction fields you select to Left on this phone.”
2. Show a device-specific 4–6 step visual guide; deep-link to Shortcuts where Apple permits, but do not imply installation.
3. Expose a single `Add Expense` App Intent with clear amount, merchant, date and card parameters.
4. Use current App Intent supported modes; verify background persistence on the oldest supported iPhone.
5. Add “Test setup” with a clearly marked S$0.01/demo payload that never pollutes real totals, or writes a temporary entry then deletes it.
6. Store local automation-health state: last successful automated capture, last source, and “not seen in 14 days” troubleshooting—not surveillance analytics.
7. After each capture, show an optional local confirmation: amount, normalised merchant, category and safe-to-spend. Provide “Fix category” action.
8. Include an automation reset/troubleshooting page for card replacement, disabled automation, duplicate capture and iOS upgrade.

---

# Part 5 — Differentiation opportunities

| Positioning | Target user and pain | Why competitors under-serve it | Required product | Monetisation / market size | Difficulty / verdict |
|---|---|---|---|---|---|
| **Private SG daily-spend companion** | Singapore iPhone users who will not link a bank but hate manual entry | US leaders lack SG connections; local bank apps are institution-centric; Dime is manual-first | Wallet automation, fast manual add, local merchant rules, PayNow/statement fallback, safe-today, local-only/CloudKit privacy | Strongest willingness-to-try; modest willingness-to-pay. SG is a beachhead, then merchant packs for other markets | **Best option. Medium difficulty.** Large enough for a portfolio/side-income app, not a venture-scale SG-only business. |
| **Student / NS allowance mode** | Students and NSF/NSmen managing allowance, meals, transport, subscriptions and irregular top-ups | YNAB is expensive/complex; major apps assume salaries/bank connections; Dime is generic | Studying/NS/working onboarding presets, allowance/pay cycle, food/transport/phone categories, semester/ORD goals, low-balance safe-today | Free acquisition wedge; lifetime purchase more plausible than subscription | **Good go-to-market segment, not the whole brand.** Keep as onboarding preset/content pack. |
| **One number, not a finance suite** | Users with ADHD or money anxiety who want an immediate spending decision | Monarch/Wallet/Money Manager are information-rich; YNAB has method overhead | Honest safe-today formula, widget, one-tap detail, weekly sentence | Broad appeal beyond SG; premium forecasting later | **Strong complementary positioning.** Must resist feature creep and prove calculation trust. |
| **PayNow/PayLah capture specialist** | SG users whose daily payments are invisible to Wallet | Wallet automation only covers eligible card taps; global apps lack local screenshot/statement parsers | Share extension, Vision OCR, DBS/POSB/PayLah/PayNow fixtures, preview/dedupe | Valuable local differentiation; could attract several thousand users | **Promising V1, not MVP.** Parser maintenance is real; support only narrow formats initially. |
| **Privacy-first offline budget** | Users who reject bank credentials and cloud analytics | Actual is private but technical; Dime is simple but not SG-specific | Native local store, optional iCloud/CloudKit, no third-party SDKs, full export/delete, transparent threat model | Paid lifetime unlock fits; competes globally | **Credible but privacy alone is insufficient.** Pair it with capture and safe-today. |
| **Shared travel/couple budgets** | Couples, roommates and trips | Spendee/Wallet/Buddy/Monarch already solve it with mature cloud systems | Invites, roles, audit/undo, offline conflicts, multi-currency, settlement | Monetisable Premium feature | **Crowded and hard.** Current code proves capability, not demand. Defer. |
| **Actionable local insights** | Young adults who want to know what changed, not chat with a bot | Many apps show generic charts or AI prose | Deterministic weekly sentence, category spike, remaining-pay-cycle consequence, explainable rule | Premium insight/forecast tier | **Useful later.** No chatbot. Each insight must link to transactions and an action. |
| **Gamified savings** | Users needing motivation | Many apps add superficial badges; it clashes with trust | At most one mature mechanism: under-safe-spend days or goal progress, never shame | Low direct monetisation | **Mostly avoid.** Test only after retention data shows a motivation problem. |

Recommended positioning statement:

> **Know what’s left today. Apple Pay taps can log themselves through your own Wallet automation; PayNow takes seconds; your bank login is never required. Built for Singapore, private by design.**

Use “can” until the physical-device gate proves every supported configuration. Avoid claiming “every tap” because card/merchant/trigger behaviour can vary.

---

# Part 6 — Prioritised roadmap

## Before App Store launch

This assumes the goal is a genuine native App Store product. A two-to-four-week release cannot include the full native rewrite described in the existing plan; the smallest honest release is narrower and may need TestFlight rather than public launch.

| Order / priority | Item | Reason / user impact | Effort | Dependencies | Main risk |
|---:|---|---|---|---|---|
| **1 — P0** | Physical-device Wallet automation spike | Proves or kills the differentiation thesis before rewrite work | 1–3 days | Target iOS, cards, Singapore merchants, minimal App Intent prototype | Merchant/amount not exposed reliably; background write limitations |
| **2 — P0** | Decide architecture and public data boundary | Every privacy, sync, deletion and App Store decision depends on it | 1–2 days decision; implementation larger | Gate result, Apple account type, CloudKit choice | Trying to preserve PWA + Netlify + Supabase creates a hybrid no user can understand |
| **3 — P0** | Fix current calculation/data-integrity bugs and add tests | Financial trust; prevents porting defects to Swift | 3–5 days | None | Hidden assumptions about savings/investment entries |
| **4 — P0** | Cut Poker and Shared from launch target | Reduces review, privacy, navigation and rewrite scope | 1 day in target definition | Product decision | Existing users of personal build need a separate build/data path |
| **5 — P0** | Native core: transaction model, local persistence, domain-test port | Required for an App Store-quality, offline-first iPhone app | 2–4 weeks alone | Architecture settled | Existing 8–12 week estimate is more realistic for polished full MVP |
| **6 — P0** | First-run pay-cycle/budget setup + Home/Add/History | Makes defaults trustworthy and core flow usable | 1–2 weeks | Native model | Onboarding becomes a questionnaire; keep it short |
| **7 — P0** | Transaction detail with edit/delete/undo, search/filter | Baseline ledger control | 4–7 days | Native history | Undo and imports need stable IDs |
| **8 — P0** | Export transactions, full delete, privacy policy/label audit | User control and App Store compliance | 3–7 days | Final storage/sync design | Claiming “Data Not Collected” while CloudKit/telemetry or support flows collect data |
| **9 — P0** | Accessibility/light-dark/performance pass | Launch quality and inclusive use | 4–7 days + device tests | UI stable | Large-number layout at accessibility sizes; chart semantics |
| **10 — P0** | Guided automation setup + test + capture feedback | Converts differentiator into a usable feature | 1–2 weeks | Gate passed, App Intent works | Setup completion rate too low |
| **11 — P0** | TestFlight, review notes, screenshots and support path | Finds device/card/setup failures Apple reviewer cannot reproduce | 2 weeks with 15+ users | Feature complete | Public launch without setup metric repeats competitor trust failures |

**Production gate:** do not submit until (a) automation setup is measured, (b) no financial calculation is known-wrong, (c) delete/export work, (d) the privacy label matches the binary and services, (e) VoiceOver/Dynamic Type pass, and (f) at least one end-to-end Wallet/manual capture path works on physical devices.

## First three months after launch

| Order / priority | Item | Reason / user impact | Effort | Dependencies | Risk / evidence to require |
|---:|---|---|---|---|---|
| **1 — P1** | Instrument privacy-preserving funnel metrics | Learn whether setup and capture actually work | 2–4 days | Consent/analytics decision | Do not sacrifice privacy position for vanity metrics; prefer local + App Store Connect aggregates |
| **2 — P1** | Merchant normalisation and “always categorise” rules | Raises first-try accuracy and reduces review work | 1–2 weeks | Real anonymised/consented fixtures | Rule collisions and merchant drift |
| **3 — P1** | Manual recurring schedules + reserved-bill safe-today | Makes the hero number honest | 1–2 weeks | Pay-cycle model | Generated/imported duplicates; schedule drift |
| **4 — P1** | Weekly recap and adaptive reminders | Improves retention without spam | 3–5 days | Notification permission after value moment | Notification fatigue; measure opt-out |
| **5 — P1** | Full backup/restore and migration verification | Trust/recovery | 3–5 days | Stable data schema | Old-schema restores and partial failures |
| **6 — P1** | Narrow DBS/POSB/OCBC/UOB CSV import | Covers users who cannot/will not automate | 2–4 weeks | Sample statements with consent | Format changes; start with one bank |
| **7 — P1** | Decide monetisation from retention and requests | Avoid pricing an unproven habit | 1 day decision + StoreKit work later | Week-4 retention, active user interviews | Optimising conversion before value |

## Longer-term features

| Order | Feature | Build only if… | Effort / dependencies | Risk |
|---:|---|---|---|---|
| 1 | PayNow/PayLah screenshot/PDF share import | Users repeatedly cite missing non-card capture | 2–4+ weeks; Vision/share extension/parser fixtures | Template drift, sensitive documents, OCR errors |
| 2 | Savings goals / sinking funds | Users want future commitments, not just lower spend | 1–2 weeks after budget model stabilises | Double counting with savings category |
| 3 | Siri “can I afford S$X?” and better widgets | Safe-today retention is proven | 1–2 weeks; App Intents/WidgetKit | Incorrect spoken advice framing; stale widget cache |
| 4 | CloudKit shared budgets | A meaningful cohort asks to share | 1–2 months; roles/conflicts/export/delete | High support and conflict burden |
| 5 | Multi-currency content packs | Demand exists outside SG/travel cohort | 2–4 weeks plus exchange-rate policy | Rate data/privacy, misleading combined totals |
| 6 | Commercial bank aggregation | Users will pay enough to cover provider/support/compliance | Partnership/provider evaluation, legal/privacy work | Vendor lock-in and permanent sync support load |

---

# Part 7 — Final verdict

## 1. Does the current app provide enough value to launch?

**As a personal PWA: yes. As a public App Store app: no.** The current product is already useful for its developer and trusted users, and the green test/build results support that. Public launch requires a coherent data model, native iOS implementation or materially native platform integration, corrected analytics, onboarding, complete transaction control, privacy/deletion artefacts, and physical-device validation of the automation thesis.

## 2. Strongest existing features

1. Fast amount-first entry with immediate offline durability.
2. Safe-to-spend and computed buffer as decision-oriented outputs.
3. Idempotent ingestion plus explicit uncategorised review instead of silently guessing “Others.”
4. Singapore-time handling and DBS/local merchant foundations.
5. CSV transaction portability and an unusually well-tested codebase.

## 3. Weakest areas

1. Fragmented privacy/storage architecture and one shared personal-data bearer token.
2. No onboarding despite complex defaults and automation setup.
3. Trust defects in analytics and incomplete delete/history workflow.
4. No recurring/future-cost model, making safe-to-spend optimistic.
5. Scope dilution from Poker, Shared and themes before core App Store readiness.

## 4. Five most important improvements

1. Prove the Wallet automation fields and setup completion on real Singapore devices.
2. Choose one public architecture—prefer local-first native—and eliminate the shared-token personal backend.
3. Fix calculation/scoping bugs; unify edit/delete/undo/search in History.
4. Add a four-step pay-cycle/budget/privacy onboarding.
5. Make safe-to-spend account for upcoming recurring costs, then put it in a native widget.

## 5. Best realistic differentiator

**Near-zero-entry, no-bank-login capture feeding one accurate daily spending number, tuned for Singapore.** Privacy is the trust reason; Wallet/PayNow capture is the behavioural advantage; safe-to-spend is the payoff.

## 6. Features to avoid

Avoid launch-time bank aggregation, AI chat, investment/net-worth tools, credit score, social feed, broad gamification, receipt archives, multi-currency, shared budgets, and extra themes. Keep Poker out of the public product.

## 7. Can it generate side income?

**Yes, modestly, if retention is real; unlikely as a Singapore-only salary replacement.** A solo native app with several thousand engaged users and 1–3% paid conversion could cover developer fees/hosting and generate meaningful side income. The strongest economics come from low ongoing infrastructure/support—not from paid bank APIs. The discontinuation of Seedly tracking is both an opening and a warning about retention/business value.

## 8. Recommended free vs paid structure

Launch free during TestFlight and initial App Store learning. When retention is proven:

**Free forever:** manual and Wallet capture, core categories/budgets, safe-to-spend, current + full transaction history, search, one widget, CSV export, delete/backup, basic weekly recap.

**Paid (S$14–20/year or S$35–50 lifetime, test locally):** recurring/subscription intelligence, advanced forecasting, custom merchant rules/content packs, richer widgets/Siri, goals, shared budgets if built, cosmetic themes/icons.

Do not paywall export, deletion, basic history, accessibility, or the automation required to experience the product’s promise.

## 9. Smallest improved version releasable in two to four weeks

A **credible TestFlight MVP**, not a polished public App Store launch:

- Native Home/Add/History only.
- Local transaction storage; no Netlify, Supabase, Poker, accounts or third-party analytics.
- Amount-first manual expenses, edit/delete/undo and search.
- Short onboarding for pay cycle, spend limit and three default categories.
- Correct safe-to-spend today.
- CSV export and Delete All Data.
- One Wallet-trigger/App Intent prototype **only if the physical-device gate passes**; otherwise ship manual-first TestFlight and measure entry speed.
- Light/dark, VoiceOver labels, Dynamic Type and a plain privacy policy.

Two to four weeks is aggressive for a student doing a native rewrite. If there is no existing SwiftUI foundation, a more honest expectation for the complete differentiated MVP—including robust automation onboarding, widget, accessibility and TestFlight validation—is **8–12 weeks of evenings**, consistent with the repository’s own planning estimate.

---

# Source notes

Primary sources were preferred for features, platform constraints and pricing: official product/help pages, Apple documentation, SGFinDex/DBS, and official App Store listings. App Store review samples are user reports and can describe bank/provider-specific failures rather than universal product behaviour. Unsupported or region-dependent claims are labelled accordingly.

Key sources:

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Wallet Transaction trigger](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios)
- [Apple personal automation auto-run settings](https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/9.0/ios/26)
- [Apple FinanceKit eligibility and availability](https://developer.apple.com/financekit/)
- [Apple App Intents](https://developer.apple.com/documentation/appintents/app-intents)
- [SGFinDex official site and participant model](https://www.sgfindex.gov.sg/)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API security](https://supabase.com/docs/guides/api/securing-your-api)
- Competitor official and App Store pages linked inline in the comparison tables.
