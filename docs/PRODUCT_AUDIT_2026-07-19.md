# Product Audit — 2026-07-19

**Method:** vault design-intent notes + source review + prior artifacts (`UX_AUDIT_2026-07-10.md`,
`PRODUCT_COMPETITOR_ANALYSIS_2026.md`, `PROJECT_IMPROVEMENT_STATUS.md`). This audit deliberately
**does not repeat** findings those documents already closed; it audits the product as it exists
today and asks "what would make this one of the best in its category," not "what is broken."

**Perspective:** PM + UX + senior engineer + founder, brutally honest.

---

## 0. Executive verdict

**Engineering maturity has outrun product ambition.** The codebase is in the top percentile of
personal projects: 559+ tests, live RLS isolation tests, mobile E2E with axe scans, bundle budgets,
branch protection, Sentry, a written design system, and a closed-loop audit culture. Lighthouse 94
mobile / 100 desktop. Almost every finding from the July 10 audits has shipped.

The consequence: **further polish has near-zero marginal return.** The frontier is no longer
"fix the UX" — it is four structural gaps:

1. **The ledger cannot represent money reality.** Expenses only — no refunds, no income events, no
   recurring bills, no foreign currency. The first time a user gets a refund and can't record it,
   the number on the dashboard is wrong, and the entire product promise ("trust the number enough
   to decide a purchase") is broken *by design*, not by bug.
2. **Capture is silent.** The differentiating feature — background ingestion — gives no feedback
   when it works and, worse, no signal when it *stops* working. iOS Shortcuts automations die
   silently after OS updates. A dead Shortcut means weeks of quiet under-counting: the most
   dangerous failure mode a "trust the number" product can have.
3. **The app has no memory.** Insights is a single-month view. There is no month-over-month trend,
   no "your average month," no year view, no recap. The app answers "how is July going?" but never
   "am I getting better?" — which is the question that creates long-term retention.
4. **The platform ceiling is being under-used before being hit.** Web Push on installed iOS PWAs
   (16.4+) is available and unused — it is the single highest-leverage feature available without
   native code. Widgets/Siri genuinely need the Capacitor path (already audited, on hold for
   hardware).

**Scores** (calibrated against the best of the category — Copilot, Dime, YNAB, Monarch):

| Dimension | Score | Note |
|---|---|---|
| Engineering quality | 9.5/10 | Better process than most funded startups |
| UX craft (current scope) | 8/10 | Post-audit fixes landed; remaining issues are structural, not polish |
| Product completeness vs category | 5/10 | Expense-only ledger, single month, no notifications |
| Differentiation | 8/10 | No-bank-login background capture is genuinely rare |
| Business viability | 2/10 | Three users, by design — see §8 for the honest framing |

---

## 1. Features

### F1. Refunds & income events — the ledger must stop lying
- **Problem:** `Entry` is expense-only. A refunded Grab ride, a hawker overcharge reversal, a
  cashback credit — none can be recorded. Users either skip it (dashboard overstates spend) or
  delete the original entry (history lies, and dedupe may re-ingest it).
- **Why it matters:** the product promise is a *trustworthy* number. An unrepresentable
  transaction class guarantees drift.
- **Impact:** High — every user, monthly frequency. **Difficulty:** Medium (type union or signed
  amount + UI toggle + compute/tests). **Effort:** ~2–4 sessions. **Priority: Critical.**
- **Competitors:** every serious tracker (Dime, Money Manager, Spendee) has this.
- **Trade-off:** touches `compute.ts`, CSV round-trip, ingest normalisation (DBS refund emails
  could eventually auto-capture as refunds — a wow follow-on). Keep scope to
  `refund` (negative-effect) first; full income tracking can wait.

### F2. Recurring / scheduled entries
- **Problem:** monthly fixed costs (phone bill, subscriptions, transport concession) must be
  re-keyed by hand each month, or they silently distort "safe to spend" early in the month.
- **Design note:** no server cron needed — materialise due recurrences client-side on app open
  (idempotent by `dedupeKey = ruleId+month`), which stays offline-first and matches the sync model.
- **Impact:** High. **Difficulty:** Medium. **Priority: High.**
- **Competitors:** Dime does this well with reminders; Copilot detects recurring automatically.

### F3. Web Push — capture receipts, weekly recap, budget alerts ("wow" feature #1)
- **Problem:** capture is invisible. The user taps their phone at a kopitiam and *nothing*
  confirms the app noticed.
- **The feature:** after `ingest` stores an entry, a Supabase Edge Function sends Web Push (iOS
  16.4+ installed PWA): *"Captured S$5.80 · Toast Box → Lunch · S$41 left this week"* — tap to
  open, one more tap to recategorise. Same channel then powers a Sunday-evening weekly recap and
  an "80% of Lunch used" threshold alert.
- **Why it matters:** this converts the app from "a place you check" to "an ambient companion."
  It is the closed loop that makes background capture *feel* magical instead of merely working.
  No mainstream tracker can do this without bank integration; this app can because it owns ingest.
- **Impact:** Very high — the defining feature. **Difficulty:** Hard (VAPID keys, push service
  worker, subscription storage per user, iOS permission flow, notification payload privacy).
  **Effort:** ~1–2 weeks of sessions. **Priority: High (the v1.5 centerpiece).**
- **Trade-offs:** iOS push for PWAs requires Home-Screen install + explicit permission (all 3
  users already installed); payloads should avoid full amounts if lock-screen privacy matters —
  make content configurable.

### F4. Capture-health watchdog ("wow" feature #2, and cheap)
- **Problem:** Shortcuts automations silently stop (iOS updates, toggled automations, expired
  token). Today the only signal is the last-capture time buried in Settings.
- **The feature:** client-side check on launch — if `sourceKind` captures were regular and have
  now been absent > N days, show a Home banner: *"No automatic captures since Jul 12 — your
  Shortcut may have stopped. Test it →"* (links to the existing setup flow / test POST). With F3,
  also send it as a push.
- **Impact:** High — protects the core trust loop. **Difficulty:** Easy (client-only heuristic
  over existing data). **Effort:** 1 session. **Priority: Critical** (highest impact ÷ effort in
  this audit).

### F5. Multi-currency capture (JB/travel mode)
- **Problem:** the Apple Pay Shortcut already sends `currency`, but the app is SGD-only. For a
  Singapore user, MYR weekends in Johor are routine; those transactions today are either wrong
  (stored as SGD face value) or skipped.
- **Recommendation:** store original `amount`+`currency`, convert to SGD at capture time (static
  monthly rate is fine; perfect FX is not the job), display both on the entry.
- **Impact:** Medium-high for SG users; genuine differentiator ("built for Singapore" includes
  JB). **Difficulty:** Medium-Hard (schema + ingest + display + tests). **Priority: Medium.**

### F6. Trends & longitudinal insights (the retention feature)
- **Problem:** Insights is one month at a time. No month-over-month deltas, no 6-month category
  trend, no "average month," no best/worst month.
- **Recommendation:** a "Trends" section on Insights: 6-month total + per-category sparklines,
  "July vs June: −S$83," average daily spend trend. All data exists locally; `compute.ts` needs
  ~3 new pure functions.
- **Impact:** High — this is what makes month 6 of usage more valuable than month 1.
  **Difficulty:** Medium. **Priority: High.**

### F7. Monthly recap ("Your July") — narrative + optional AI
- A month-end card (and later push): top category, biggest day, vs-last-month, buffer outcome,
  one observation. **Rule-based sentences first** — the existing insight-sentence work proves the
  pattern. An LLM (Claude Haiku via Edge Function) is an optional garnish for phrasing variety,
  *not* a requirement; do not add an API dependency for the first version.
- **Impact:** Medium-high (retention, delight). **Difficulty:** Medium. **Priority: Medium.**

### F8. Settle-up for shared budgets
- **Problem:** shared budgets track member totals but stop short of the number groups actually
  want: *who owes whom*. That is why Splitwise exists.
- **Recommendation:** a settle-up card on shared budget detail: net position per member against
  the even (or weighted) split, with a "mark settled" event.
- **Impact:** High for the 2 shared users; makes Shared a real product instead of a mirror.
  **Difficulty:** Medium (pure math over existing `memberTotals` + one new event type).
  **Priority: High.**

### F9. Savings goals (cumulative, cross-month)
- Savings/Investments are monthly envelopes with no memory. A goal ("S$5,000 emergency fund by
  Dec") that accumulates monthly savings entries gives the two committed categories a *why*.
- **Impact:** Medium. **Difficulty:** Medium. **Priority: Medium.** (YNAB/Monarch do this well.)

### F10. Quick-add presets & richer deep links (power-user + automation)
- `?add=true` exists. Add `?add=true&category=lunch&amount=5.80` → an iOS Shortcuts *widget* of
  one-tap presets ("Kopi S$2.20") with zero native code. Also `?screen=insights` etc. for
  Shortcuts users. **Difficulty:** Easy. **Priority: High** (cheap, on-brand: fast entry above all).

### F11. Uncategorised triage: one-tap chips
- The triage bucket exists on Home, but categorising requires opening the entry editor.
  Render 3–4 most-likely category chips inline on each uncategorised row (the learned-category
  data already ranks likelihood) — one tap to file, which also feeds the learning loop faster.
- **Impact:** Medium-high (this is the daily 10-second job). **Difficulty:** Easy-Medium.
  **Priority: High.**

### F12. Possible-duplicate flag (honest dedupe)
- C3 is documented: Apple Pay dedupe can double-save across a minute boundary. Surface it:
  entries with same merchant+amount within a short window get a subtle "possible duplicate —
  keep / merge" chip. Turns a documented limitation into visible care. **Difficulty:** Medium.
  **Priority: Low-Medium.**

### AI opportunities — an honest note
The fashionable move is a chat interface; it would be wrong here. The app's identity is *glance,
decide, close*. The high-value "AI" is already present in unfashionable form (learned merchant
categorisation, meal-window rules). Worthwhile additions in priority order: (1) smarter merchant
normalisation (fuzzy matching to reduce history fragmentation — no LLM needed), (2) recap phrasing
(F7, optional), (3) natural-language quick-add ("kopi 2.2") parsed locally with a regex before any
model is considered. Skip: chatbots, "ask your finances," AI-generated advice.

---

## 2–3. UX & UI

Most of the 2026-07-10 findings are closed (verified in source: five-tab nav, date-on-Add, sync
status, toasts, onboarding, confirm dialogs, 44px targets, contrast fixes). What remains:

| # | Finding | Detail | Priority |
|---|---|---|---|
| U1 | **No URL/history integration** | Navigation is React state (`App.tsx`). iOS edge-swipe-back and browser back do nothing or exit the PWA; no scroll restoration; deep links limited to hand-built params. Hash-based routing (even hand-rolled, no router dependency) fixes back-swipe, per-tab deep links, and restores the OS-native grammar the design principles claim. | High |
| U2 | **All four themes are dark** | `themeRegistry.ts`: original-dark, deep-sea, copper-current, berry-circuit. Outdoors at noon in Singapore — the actual usage context of a lunch tracker — dark UI legibility drops hard. One true light theme is worth more than two of the existing alternates. | High |
| U3 | **Theme count is a liability** | Four themes × 9 screens × e2e/axe matrix is real maintenance surface for a 3-user app (the CSS budget bump already traces to it). Keep `original-dark` + one light; retire or freeze the other two. | Medium |
| U4 | **Insights hard-codes Lunch** | The weekly bars give Lunch a privileged sub-bar (`Insights.tsx:116-127`). Correct today for the owner, wrong as a product: the "pace" category should be whichever variable envelope is largest / user-chosen. | Low-Medium |
| U5 | **Onboarding stops before the differentiator** | First-run covers budget setup, but automatic capture — the reason this app exists — is only discoverable in Settings. After the third manual entry, offer one card: "Tired of typing? Set up automatic capture (3 min)." (The July-10 audit's §H1 sequencing, still unimplemented.) | Medium |
| U6 | **Empty Insights / short months** | Insight suppression below 15 entries exists; the Trends section (F6) needs the same discipline from day one — no sparkline until 2 full months exist. | Low |
| U7 | Poker `+S$0.00`-style polish and Shared sign-in explainer shipped; **Shared value-prop before OAuth** should be re-checked after any Shared work — it drops off fast. | Low |

---

## 4. Performance

Already strong (138 KiB gzip initial vs 143 budget; Lighthouse 94/100; CLS 0; lazy routes; delayed
spinners). Remaining items are marginal:

- **P1.** Mobile LCP 2.505s sits exactly at the "good" boundary; treat any regression as a gate
  failure, but do not refactor for it now (matches the M14 deferral decision).
- **P2.** If Trends (F6) adds charts, keep them dependency-free (CSS/SVG bars like today). A
  charting library would be the single biggest bundle risk in the pipeline.
- **P3.** Entry-list virtualisation remains unnecessary at ~100 entries/month; re-check at 5k.
- **P4.** Battery: the Apple Pay Shortcut fires per transaction; fine. Push (F3) adds no client
  polling — correct architecture.

## 5. Security & privacy

Solid baseline (RLS with live tests, CSP, security headers tested, gitleaks in CI, Sentry with PII
off, no secrets in bundle, dependency audit clean). Remaining:

- **S1. Ingest token lifecycle.** Long-lived shared bearer per user, minted once. Add: rotate
  button in Automatic Tracking (mint new → show once → old expires after grace window) and a
  "last used" timestamp next to it (data already exists as last-capture). Today, rotation is a
  server-side manual op. **Priority: Medium.**
- **S2. Push payload privacy (when F3 lands).** Amounts on the lock screen are sensitive; default
  to "Captured · Toast Box" with amounts opt-in. **Priority: with F3.**
- **S3. Local data at rest.** Financial history in localStorage is readable by anyone with the
  unlocked phone. This is an accepted personal-app trade-off; document it in the README privacy
  note rather than engineering around it. Supabase being source of truth already mitigates
  device-storage eviction. **Priority: Low (document only).**
- **S4. Shared budgets: any member can edit/delete any entry** (by design). Add an activity line
  ("edited by N") if Shared grows beyond trusted friends. **Priority: Low.**

## 6. Technical

- **T1. Hash routing** — see U1. The one architectural change with daily-felt UX payoff.
- **T2. Branch coverage 78.08%** vs the 80% project bar; statements/lines are above. Close the
  2% gap when touching `compute.ts` for F1/F6. **Priority: Low.**
- **T3. Recurring + refund logic must live in `src/shared/`** so future ingest-side refund
  detection reuses it — same discipline as `dedupe.ts`. **Priority: design constraint, not task.**
- **T4. No product analytics — keep it that way.** For 3 users, Sentry + the capture-health
  banner is complete observability. Adding analytics would trade privacy identity for zero
  information. (Listed because a generic audit would recommend adding it; that would be wrong.)
- **T5. Ops loose ends from the migration memory:** confirm Shortcuts repoint, the two shared
  users' imports, staging teardown, and `main` merge are all closed out — stale infrastructure is
  attack surface and cognitive load.

## 7. Product strategy — the brutal part

1. **The strategy is capture, not budgeting.** YNAB wins allocation; Copilot wins bank-connected
   convenience; Dime wins manual speed. This app's only defensible position is the one it already
   staked: *near-zero-effort capture with no bank login, tuned for Singapore*. Every roadmap item
   should be scored by "does this make the number more trustworthy or the capture more
   effortless?" Goals, themes, poker, even shared budgets are secondary to that test.
2. **The riskiest dependency is Apple, not competitors.** The Wallet-trigger Shortcut is
   undocumented-adjacent behaviour. It has broken before (`-1005` drops) and can be removed in
   any iOS release. The DBS-email path is the hedge; keep both first-class forever, and build the
   watchdog (F4) precisely because the foundation is borrowed.
3. **What creates love:** the first push receipt (F3). What creates retention: trends and recaps
   (F6/F7) — evidence of progress. What creates trust: watchdog (F4) + refunds (F1) — the number
   never quietly lies.
4. **What to stop doing:** shipping more themes; polishing screens that already pass axe and E2E;
   any feature aimed at hypothetical App Store users while the hold is in place.

## 8. Business — honest framing

This is a 3-user personal product with a public repo. Monetisation is a distraction from its two
real payoffs: (a) it is a **portfolio asset** — the CI/RLS/audit culture is the story, write it
up; (b) it is a **wedge** — if the Capacitor path ever ships, the honest product is a niche
one-time-purchase App Store app (S$8–12, "no subscription, no bank login, your data is yours"),
where the anti-subscription stance *is* the marketing in a category drowning in US$99/yr fees.
Growth loop that already exists: shared-budget invite codes. Do not build referral mechanics,
premium tiers, or viral features for a product whose entire user base fits in a hawker booth.

## 9. Competitive deltas (since the 2026-07-10 analysis)

The July-10 competitor analysis remains valid; deltas worth acting on now:

| Competitor | Still ahead on | Adopt | Avoid copying |
|---|---|---|---|
| **Dime** | Widgets, Siri, recurring, reminders | F2 recurring now; widgets/Siri belong to the Capacitor phase | Its settings sprawl |
| **Copilot** | Recurring detection, "Free to Spend" polish | Threshold alerts via F3 | Bank-connection dependence, subscription |
| **YNAB** | Allocation rigor, goals | F9 goals-lite only | The methodology tax; four-rule dogma |
| **Splitwise** | Group debts | F8 settle-up | Its ad-walled free tier |
| **Monarch** | Multi-month trends | F6 | Configurable-dashboard complexity |
| **Seedly/SG apps** | Local mindshare | Nothing — its tracker ambitions receded; the SG-first niche is genuinely open | — |

SGFinDex remains the only legitimate SG bank-sync path and is FI-gated; it is a Future-ideas item,
not a plan.

## 10. Three-year vision

The best version of this product in 2029 is **the ambient money companion for Singapore iPhones**:
installed from the App Store (Capacitor shell over this exact React core), every tap of the phone
acknowledged by a push receipt within seconds, a Lock-Screen widget showing safe-to-spend-today, a
Siri "log two dollars kopi," JB weekends handled in MYR, a Sunday recap that reads like a friend
wrote it, and a yearly "Your 2029" story. Under it: the same Supabase schema, the same offline-first
queue, the same no-bank-login stance — and an export button that still produces a CSV any
spreadsheet can read. The moat is not features; it is that the number has never lied.

---

## Rankings

### Top 20 by impact
1. F3 Web Push capture receipts (+ recap/alerts)
2. F4 Capture-health watchdog
3. F1 Refunds/negative entries
4. F2 Recurring entries
5. F6 Trends (month-over-month, 6-month)
6. U1/T1 Hash routing + back-swipe
7. F8 Shared settle-up
8. U2 Light theme
9. F11 One-tap uncategorised triage
10. F10 Quick-add presets + deep links
11. F7 Monthly recap card
12. F5 Multi-currency (JB mode)
13. U5 Post-third-entry capture onboarding nudge
14. F9 Savings goals
15. S1 Token rotation + last-used
16. F12 Possible-duplicate chip
17. U3 Theme retirement (4→2)
18. U4 Generalise Insights pace category
19. N4 forecast smoothing guard (from N-series)
20. T2 Branch coverage to 80%

### Top 10 quickest wins (impact ÷ effort)
1. F4 watchdog banner (1 session)
2. F10 deep-link presets (1 session)
3. F11 triage chips (1–2 sessions)
4. N4 forecast guard (minutes)
5. U5 capture nudge card (1 session)
6. S1 last-used display (uses existing data)
7. Insights month-over-month delta line (subset of F6, compute exists)
8. U4 pace-category generalisation
9. F12 duplicate chip (heuristic already specified by C3 docs)
10. U3 freeze two themes (deletion is fast; the win is stopping the 4× test matrix)

### Top 10 long-term investments
1. Capacitor 8 shell → App Store, widgets, Siri (blocked on macOS hardware; already audited)
2. F3 Web Push infrastructure (the PWA-era version of #1)
3. F1+F2 ledger model (refunds → income → recurring — the data model for everything later)
4. F6/F7 longitudinal engine (trends, recaps, eventually "Your Year")
5. F5 multi-currency schema
6. F8 shared settle-up → household mode
7. Merchant normalisation layer (feeds categorisation, dedupe, and duplicate detection)
8. SGFinDex / statement-import exploration
9. Ingest source expansion (more banks' alert emails; generic email parser)
10. Public-template/open-source packaging of the architecture

## Roadmap

**v1.1 — "The number never lies" (1–2 weeks of sessions)**
F4 watchdog · F1 refunds · F11 triage chips · F10 presets/deep links · N4 guard · S1 token
last-used + rotate · close T5 migration loose ends.

**v1.5 — "Ambient" (1–2 months)**
F3 Web Push (receipts → weekly recap → threshold alerts) · F2 recurring · F6 Trends ·
U1 hash routing · U2 light theme (+U3 retire two) · F8 settle-up · U5 capture nudge.

**v2.0 — "A real product" (when macOS hardware exists)**
Capacitor shell · App Store listing (one-time price) · Lock-Screen/Home widgets · Siri/App
Intents · F5 multi-currency · F7→"Your Year" recap · F9 goals.

**Future ideas**
SGFinDex · generic bank-email parser · household mode · watch complication · on-device ML
categorisation · open-source template release.

## Remove / simplify / redesign
- **Remove:** two of four themes (freeze, then delete); any remaining Netlify-era references
  (verify T5); referral/monetisation thinking until v2.0.
- **Simplify:** Insights' privileged Lunch sub-bar (U4); push all new domain math through
  `src/shared/` (T3).
- **Redesign:** navigation state → hash routing (U1) — the only remaining architectural UX debt.
- **Explicitly keep:** the numpad Add flow (best-in-class), undo-not-confirm pattern, the buffer
  model (post-H6), offline-first queue, the no-analytics stance, and Poker (it is now correctly
  demoted, is included in JSON backup, and costs nothing — cutting it would be dogma, not product
  sense).
