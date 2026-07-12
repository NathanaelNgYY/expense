# iOS App Store — Execution Checklist

> **Status: ON HOLD as of 2026-07-10.** The owner has no macOS hardware, which blocks building,
> signing, and submitting iOS apps. No Swift was written and G-1 was never resolved. **The PWA is
> the product for the foreseeable future.** The active plan of record is now the Supabase backend
> migration — see `docs/superpowers/specs/2026-07-11-supabase-migration.md`. Task IDs (`T-01`–`T-35`)
> and gates (`G-1`–`G-3`) below are dormant: do not block PWA work on them, and do not pick up `T-`
> tasks unless this hold is explicitly lifted.
>
> *(Superseded status: proposed, not started. Nothing below has been built.)*

## How to use this document

Every actionable item has a stable ID (`T-01`, `G-1`, …). To dispatch work, name the ID:

- `"Do T-04"` — implement one task.
- `"Do T-04 through T-07"` — implement a slice.
- `"Verify G-1"` — run a gate.

Rules for any agent picking up a task:

1. **Read the task's `Files` line before writing code.** If a listed file doesn't exist, stop and say so.
2. **A task is not done until its `Done when` clause is literally true and observed**, not inferred.
3. Check the box in this file as part of the same change that completes the task.
4. Tasks marked **`[blocked: G-n]`** must not start until that gate passes.
5. `T-` tasks are ordered by dependency, not priority. Don't reorder without saying why.

---

## Gates

Gates are go/no-go checks. Failing a gate changes the plan; it does not mean try harder.

### G-1 — Wallet trigger exposes merchant name  `[blocks: everything]`

Build a throwaway Shortcut that calls a stub App Intent and dumps its inputs.

- [ ] Confirm which variables the Wallet **Transaction** personal-automation trigger exposes on the
      target iOS version — specifically **merchant, amount, card, timestamp**.
- [ ] Confirm the automation can be set to **Run Immediately** with no confirmation tap.

**If merchant name is absent, half of this plan changes** — the merchant dictionary (T-08), the
capture notification (T-11), and automatic categorisation all lose their input. Everything downstream
is contingent on this. Do not write production Swift before this gate passes.

### G-2 — Apple Developer Program enrolment  `[blocks: T-16 onward]`

- [ ] Enrolled and identity-verified. Verification takes days; start it in parallel with G-1.

### G-3 — Automation setup rate  `[evaluated at TestFlight, gates launch]`

**The decisive metric: what fraction of installs successfully complete the Wallet automation setup.**

- [ ] Instrument it before anything else ships (T-12).
- [ ] Measure across ≥15 real Singaporean TestFlight users over two weeks.

Above **~40%** → the thesis holds, proceed. Around **10%** → the thesis is dead, and the correct pivot
is to become the fastest manual-entry app on the store. Be willing to believe the answer.

---

## The thesis, in one paragraph

The Apple Pay Wallet transaction trigger *is* the product; everything else in this repo is commodity.
Manual expense tracking has negative return on user effort — logging a $4.20 kopi costs ~15 seconds and
returns nothing felt in that moment — which is why median budget-app retention is about two weeks.
Bank aggregation (YNAB, Copilot, Monarch) solves entry cost but has poor Singapore coverage, costs real
money per connected user, and a large segment will not hand bank credentials to a solo developer.
Manual-first apps are free, private, and abandoned by week three. The Wallet trigger is the third door:
it fires locally on tap-to-pay, yields merchant and amount, and needs zero credentials and zero server.
Cross-platform React Native shops can't take an iOS-only dependency, so almost nobody markets around it.

**Every feature must either reduce the cost of an entry toward zero, or increase the payoff of an entry
toward something felt. Features doing neither are decoration.**

---

## Phase 0 — Architecture decision (settled)

**Rewrite to SwiftUI + SwiftData + CloudKit. Delete the Netlify backend entirely.**

Three independent reasons the current stack cannot ship this app:

1. **Guideline 4.2 (Minimum Functionality).** A WKWebView/Capacitor wrapper around a Vite PWA with a
   recognisably web UI is the most common first-submission rejection.
2. **Widgets, Lock Screen widgets, App Intents and Siri are the retention mechanism, and none of them
   exist in a web view.** WidgetKit is Swift. There is no path around this.
3. **Netlify Blobs holds user financial data server-side with no per-user auth.** Adding accounts
   triggers Guideline 5.1.1(v) in-app deletion obligations, a real privacy policy, and an App Privacy
   label reading `Financial Info: Linked to You` — surrendering the best marketing asset to avoid a
   rewrite.

**What is lost is small.** The valuable code is `src/shared/` plus `src/compute.ts`: **519 lines of pure
logic, covered by 267 lines of tests.** Porting to Swift is a weekend, and the tests port near
line-for-line. The screens get rewritten regardless.

**What is gained:** `Data Not Collected` on the privacy nutrition label. Zero hosting cost. No account
system. No 5.1.1(v) deletion flow. No server-side breach surface. Free cross-device sync. And a
marketing claim that is literally true rather than lawyered.

**The key technical upgrade:** replace `POST /api/ingest` with an **App Intent**. Ship
`AddTransactionIntent` with `openAppWhenRun = false`. The Wallet automation calls the intent directly;
it writes to SwiftData in the background without launching the app. This also closes an existing
security hole — `INGEST_TOKEN` is currently a bearer credential sitting in plain view inside a
user-editable Shortcut.

**Consciously accepted trade:** an iOS-only, CloudKit-only app can never have an Android or web client,
and shared budgets across a mixed-platform couple become impossible. This is the right trade for a solo
developer, but it *is* a trade.

---

## Phase 1 — Port the domain logic  `[blocked: G-1]`

Pure logic, no UI. Highly parallelisable — these tasks touch disjoint files. Port the test file
alongside each source file and keep the assertions identical; a passing ported test is the only proof
the port is faithful.

- [ ] **T-01 — Port `sgtDate`**
  - Files: `src/shared/sgtDate.ts` (10 lines), `src/shared/sgtDate.test.ts`
  - All date and budget logic is SGT-local. Do not reintroduce raw `Date` math in Swift either — this
    is the same bug class, in a new language.
  - Done when: ported tests are green.

- [ ] **T-02 — Port `entry` + `dedupe`**
  - Files: `src/shared/entry.ts` (54), `src/shared/dedupe.ts` (20), and both test files
  - Entries are keyed and deduped by `dedupeKey`. Preserve `id` and `dedupeKey` across updates — this
    invariant is what makes ingestion idempotent, and it survives the rewrite unchanged.
  - Done when: ported tests are green.

- [ ] **T-03 — Port `category`**
  - Files: `src/shared/category.ts` (70), `src/shared/category.test.ts`
  - `categoryFromHistory` learns from user corrections, and its **refusal to silently default to
    `others` is correct design that most apps get wrong.** Preserve that refusal exactly.
  - Done when: ported tests are green.

- [ ] **T-04 — Port `compute`**
  - Files: `src/compute.ts` (331 lines — the largest port)
  - Source of the Safe-to-Spend number. The existing *buffer* is computed, never stored; keep it that
    way.
  - Done when: ported tests are green.

- [ ] **T-05 — Port `dbsEmail` parser** *(reuse target, not shipped in MVP)*
  - Files: `src/shared/dbsEmail.ts` (34), `src/shared/dbsEmail.test.ts`
  - Not in the MVP — but the V1 share-sheet OCR capture has the same parsing shape, so port it now while
    the logic is fresh.
  - Done when: ported tests are green.

---

## Phase 2 — MVP  `[blocked: G-1]`

**Five features, nothing else.**

- [ ] **T-06 — `AddTransactionIntent`**
  - `openAppWhenRun = false`. Writes to SwiftData from the background.
  - Done when: a Wallet automation logs a transaction **without the app launching**, verified on a
    physical device.

- [ ] **T-07 — Wallet automation onboarding**
  - **The onboarding screen matters more than the dashboard,** because personal automations cannot be
    installed programmatically — the user must do it by hand, and most will not without excellent
    guidance. Include a "verify it worked" step.
  - Done when: T-12 instrumentation records a completed setup end-to-end.

- [ ] **T-08 — Singapore merchant dictionary**
  - Apple Pay merchant strings are garbage: `GRABPAY*RIDE`, `NTUC FP #234`, `KOPITIAM PL`. Port the
    keyword matching from `category.ts` (T-03) and ship the rules as a **versioned JSON resource,
    updatable without an App Store release.**
  - "Categorised correctly on first try" is the core quality metric. Invisible, unmarketable, and the
    reason people stay.
  - Done when: the dictionary loads from JSON, and a fixture of ≥30 real merchant strings categorises
    correctly.

- [ ] **T-09 — "Safe to Spend Today" hero screen**
  - Remaining budget ÷ days left in pay cycle, net of known fixed costs. Same math as the existing
    buffer, presented as **the only thing on screen. Resist showing five numbers.**
  - Done when: the number matches T-04's output for the same ledger.

- [ ] **T-10 — Lock Screen + Home Screen widget**
  - **This is the retention.** A budget app on the Lock Screen is seen forty times a day at zero user
    cost. One that must be opened is seen twice, then never.
  - Precompute safe-to-spend on write and cache it as a scalar in the App Group container. **The widget
    reads a scalar, never replays the ledger.**
  - Done when: widget renders from cache with no ledger access; verify by instrumenting the read path.

- [ ] **T-11 — Silent capture notification**
  - *"Logged $4.20 at Ya Kun — $18 left today."* Makes the invisible visible. Without it users don't
    believe the automation works, and **disbelief kills the setup rate the whole thesis depends on.**
    Cheap and load-bearing.
  - Done when: fires within 2s of T-06 writing an entry.

- [ ] **T-12 — Instrument the setup rate**  `[do this first — G-3 depends on it]`
  - Install → automation setup completed. **No third-party SDK** (see T-19); use App Store Connect
    analytics and local state only.
  - Done when: the funnel is observable for a TestFlight cohort.

- [ ] **T-13 — Two-tap manual add**
  - Amount keypad opens **first**, category pre-guessed. Reachable from widget and Siri. Covers cash
    and PayNow until V1.
  - Done when: two taps from Home Screen to a saved entry.

- [ ] **T-14 — Month view + CSV export**
  - One scrollable screen. Port `src/csvEntries.ts`. **Export stays free, forever** — an app that lets
    you leave easily is one that isn't holding you hostage, and paywalling export from a privacy-first
    app is self-contradictory. Same for history: never paywall the user's own past.
  - Done when: exported CSV round-trips through the ported parser.

- [ ] **T-15 — Onboarding branch, weekly recap, and the unglamorous mandatory bits**
  - Onboarding asks **"studying / working / in between"** → picks pay cycle, default categories,
    default budget. As a settings toggle nobody flips it; as an onboarding branch it is excellent,
    because **pay cycle is what everything downstream depends on.** Fifteen minutes' work, large payoff.
  - Weekly recap push: **one sentence, Sunday evening, deep-linked.** Not a screen, not a report. The
    most reliable weekly-active driver in the category.
  - Plus: dark mode, Dynamic Type, VoiceOver.
  - Done when: T-20 and T-21 pass.

### Launch with no monetization at all

No paywall, no IAP code, not even scaffolding. A paywall on a v1.0 with fifty users teaches nothing and
costs the reviews that ASO runs on.

### Explicitly not in the MVP

Shared budgets (**delete `src/sharedBudgets/`**), the poker tracker, paper-receipt scanning, spending
personality, savings challenges, goals, net-worth tracking, multi-currency, bank aggregation, an AI chat
assistant, iPad, Apple Watch, Android, a web app, any third-party analytics SDK, any IAP code.

### What makes this different, stated plainly

A normal budget tracker is a form you fill in and a chart you look at. This is a number on your Lock
Screen that updates itself when you buy coffee, and it never learns who you bank with. The chart is an
afterthought. **That inversion is the product.**

---

## Phase 3 — Apple readiness  `[blocked: G-2]`

- [ ] **T-16 — `ITSAppUsesNonExemptEncryption = false`**
  - Correct if you use only HTTPS and Apple's standard crypto. Forgetting this stalls every submission.

- [ ] **T-17 — "Delete All Data" + export, both findable without searching**
  - Wipes the local store and the CloudKit private zone. Trivial with no server.

- [ ] **T-18 — Language audit for Guideline 3.2.1**
  - **Never use *advice*, *recommend* (in a money sense), *guarantee*, *invest*, or *returns*.**
  - Say *"you're spending faster than last month."* Never *"you should cut back on food."*
  - Quiet disclaimer in Settings and in the description: *"For personal information only. Not financial
    advice."*
  - The `savings` and `investments` categories are fine as labelled buckets of the user's own money.
    **Showing a return figure or linking to a broker moves the app into a different review queue.**
  - Done when: app copy, description, and screenshots contain none of those words.

- [ ] **T-19 — Zero third-party SDKs**
  - No Firebase, Sentry, Amplitude, Mixpanel, ads. Crash reporting is **MetricKit + Xcode Organizer**;
    product analytics is App Store Connect's own aggregated analytics. This means **flying with less
    telemetry than is comfortable. That is the price of the label, and the label is worth more than the
    dashboard.**
  - Done when: **`otool -L` on the built binary** confirms it. Do not trust `Package.swift`.

- [ ] **T-20 — Accessibility pass**
  - Dynamic Type to **AX5**. Test at the largest size — the one-big-number hero screen breaks first, and
    it is the most important screen.
  - **Never encode state in colour alone:** "over budget" needs a colour, an icon, *and* a word.
  - Charts need `accessibilityValue`; VoiceOver reading "chart" is useless.
  - 44pt targets. Honour Reduce Motion.

- [ ] **T-21 — Light and dark, both audited to 4.5:1**
  - The `carbon-ledger.css` dark aesthetic must not leave the light variant an afterthought. **Reviewers
    check.**

- [ ] **T-22 — Cold launch under 400ms to a rendered number**
  - On the **oldest supported device**. Never parse or aggregate on the main thread. Depends on T-10's
    cached scalar.

- [ ] **T-23 — Permissions: almost none**
  - Notifications asked **after** the user has seen why — a cold prompt on first launch is a conversion
    disaster. Face ID only if an app lock is added. No contacts, no location, **no photo library** (the
    share sheet hands over the image without a permission grant).

### Rejections that actually matter

| Guideline | Risk | Mitigation |
|---|---|---|
| 4.2 Minimum Functionality | Web-view wrapper rejected | Native rewrite (Phase 0) |
| 3.2.1 Financial claims | *advice / invest / guarantee* | T-18 |
| 5.1.1(v) Account deletion | In-app deletion flow required | **Sidestepped: no accounts.** Worth more than it sounds |
| 3.1.1 IAP | Linking out to web checkout | StoreKit 2 only, and not before V1 |
| Export compliance | Submission stalls | T-16 |

---

## Phase 4 — Store listing & launch

### Naming

Preferred title: **`Left`** — short, brandable, and literally the question users ask.

| Title (≤30) | Subtitle (≤30) |
|---|---|
| `Left: Safe to Spend Today` | `Budget that logs itself` |
| `Tap Budget: Auto Expenses` | `Every Apple Pay tap, logged` |
| `Daily Spend: Budget Tracker` | `No bank login. No typing.` |
| `Buffer: Money Left This Month` | `Auto-track. Private. Simple.` |
| `Kopi Budget: SG Money Tracker` | `Hawker, Grab, MRT, PayNow` |

`Kopi` is charming locally and would be regretted the day you want users in Manila.

Keywords (100 chars): `expense,spending,money,save,savings,allowance,student,singapore,paynow,grab,mrt,cash,widget,private`

**Words already in the title and subtitle are indexed** — repeating `budget` or `tracker` in the keyword
field wastes characters.

### Positioning

**Singapore is a beachhead, not a market.** ~6M people, ~4M iPhones, target demographic maybe 800k,
willing-to-pay maybe 1–2%. It is an excellent place to win ASO cheaply, gather the first thousand users,
and tune the merchant dictionary. It is not a business alone. **Build so "Singapore" is a content pack**
(merchant rules, category names, currency), **not a hardcoded assumption.**

Three unique selling points:

1. **Zero-entry capture with zero credentials.** There is no bank login page, because there is no bank login.
2. **One number, on the Lock Screen.** Not a dashboard, not a report.
3. **Provably private.** No accounts, no servers, no SDKs, `Data Not Collected`, one-tap export.

Lead with the **anti-fintech** angle: *"The budget app that never asks for your bank login."* It targets
people who tried Copilot or a bank app, hit the credentials screen, and closed it. The cognitive-load
angle (*"One number. Not a spreadsheet."*) targets YNAB bounce-backs and names a feeling people
recognise. *"Built for Singapore"* is weakest as a global identity and strongest as a **go-to-market
tactic** — rank for `budget singapore` and `paynow tracker` in a low-competition storefront, then broaden.

### Store assets

Title 30 chars, subtitle 30, keywords 100, promo text 170 (editable without review). Screenshots: 6.9"
iPhone required. No iPad.

Five screenshots, **caption-first, because nobody reads the description**:

- [ ] **T-24** — Lock Screen widget on a real Lock Screen — *"Your budget, on your Lock Screen."*
- [ ] **T-25** — The capture notification after a tap — *"Every Apple Pay tap logs itself."*
- [ ] **T-26** — **The privacy nutrition label, cropped, showing `Data Not Collected`** — *"No bank login. Ever."*
      **This is the strongest screenshot and the one most developers never think to use.**
- [ ] **T-27** — Month view — *"Where it actually went."*
- [ ] **T-28** — The weekly recap notification — *"One sentence, every Sunday."*

### App Store Connect

- [ ] **T-29** — App Privacy: `Data Not Collected` — and **confirm it is actually true** (T-19).
- [ ] **T-30** — Privacy policy live at a stable URL. Two paragraphs is enough.
- [ ] **T-31** — Age rating 4+.
- [ ] **T-32** — **Review notes explaining the Wallet automation, with a screen recording.** The reviewer
      cannot test it on their device. **This is the most likely source of confusion-driven rejection.**
      State explicitly that no demo account is needed.

### Launch

- [ ] **T-33** — Crash-free across 20+ real TestFlight sessions.
- [ ] **T-34** — TestFlight with ~15 real Singaporean users for two weeks. **Measure G-3.**
- [ ] **T-35** — Ten reviews before spending a dollar on anything.

---

## Feature ledger

| # | Feature | Build | Ship | Tier | Task |
|---|---|---|---|---|---|
| 1 | Tap-to-Log (Wallet automation → App Intent) | Medium | MVP | Free | T-06, T-07 |
| 2 | Safe to Spend Today | Easy | MVP | Free | T-09 |
| 3 | Lock Screen + Home Screen widget | Medium | MVP | Free | T-10 |
| 4 | Singapore merchant dictionary | Easy | MVP | Free | T-08 |
| 5 | Share-sheet PayNow/PayLah screenshot capture | Medium | V1 | Free | — |
| 6 | Silent capture notification | Easy | MVP | Free | T-11 |
| 7 | Weekly recap push (one sentence) | Easy | MVP | Free | T-15 |
| 8 | Subscription & recurring detection | Medium | V1 | Premium | — |
| 9 | Pay-cycle survival forecast | Medium | V1 | Premium | — |
| 10 | Shared budget via CloudKit Share | Hard | V2 | Premium | — |

**Share-sheet screenshot capture** is the highest-value V1 item: PayNow, PayLah and cash are invisible to
Wallet, which is the biggest Singapore coverage gap. A Share Extension plus on-device Vision OCR plugs it
with zero server and zero credentials, and it has the same parsing shape as `dbsEmail.ts` (T-05).

### Cut or reshaped — and why

- **Spending personality / money habits — cut.** Viewed once, screenshotted, never reopened. Zero repeat
  sessions, and it makes the store screenshots look like a quiz, undermining the serious/private
  positioning. The only defensible version is invisible: tune category defaults from inferred habits,
  never surface a "type."
- **"Can I afford this?" as a screen — reshaped.** Identical math to Safe to Spend, so a dedicated screen
  is a second UI for the same number. Ship it as a **Siri/Shortcut action** instead: *"Hey Siri, can I
  afford $80?"* → *"That leaves you $40 for six days."* One-tenth the build, demos beautifully.
- **Paper receipt scanning — cut.** People *intend* to scan receipts. **Scan screens, not paper** — the
  screen is already in hand at payment time.
- **Gamified challenges — mostly cut.** Badges, mascots and confetti are retention theatre and clash with
  an adult, privacy-first positioning. The one primitive that works is the **streak**, because it is
  loss-aversion rather than reward. Ship exactly one: consecutive days under the daily safe-to-spend. No
  mascot.
- **Bubble tea as a category — no.** Lands once in a screenshot, then annoys. Hawker/kopitiam, MRT/bus
  and Grab are real categories because they are high-frequency and low-value — exactly the spending
  manual trackers lose. Bubble tea is a merchant-dictionary entry mapping to Food.
- **Poker tracker — cut from the App Store build**, kept in the personal build. It makes positioning
  incoherent, complicates the data model, and **a reviewer will spend more time on gambling-adjacent
  content than on the rest of the app combined.**

---

## Roadmap

**MVP** — the five features above. Free, no paywall, no IAP code. ~8–12 weeks of evenings.
Success = setup rate >40% (G-3) and week-4 retention >25%.

**V1** (~3 months post-launch) — share-extension PayNow/PayLah capture, subscription detection,
pay-cycle survival forecast, Siri "can I afford", the streak, custom merchant rules.
**Monetization is introduced here, not before.**

**V2** (~6–9 months) — shared budget over CloudKit sharing, **but only if V1 users ask, which they may
not: students split bills in Telegram, not budget apps.** Apple Watch complication. Goals. Multi-currency
if broadening beyond Singapore.

### Premium tier, when it arrives

Free must keep: auto-capture, safe-to-spend, the widget, unlimited history, CSV export.
Paywall: insights and forecasting, subscription detection, custom merchant rules, shared budgets,
alternate icons and themes.

Price at roughly **S$14.98/year with a lifetime unlock around S$34.98**. Expect lifetime to outsell the
subscription roughly 2:1 in this demographic — students hate recurring charges, and a whole product cycle
has just been spent telling them they are respected. Expect 1–2% conversion.

> **This is a portfolio piece and a good tool that some people pay for, not a startup.**
> Decisions get better when that is admitted up front.

---

## Reference — current implementation being replaced

| Concern | Today | After |
|---|---|---|
| Ingestion | `POST /api/ingest`, bearer `INGEST_TOKEN` in a user-editable Shortcut | `AddTransactionIntent`, no credential |
| Storage | Netlify Blobs, no per-user auth | SwiftData + CloudKit private DB |
| Sync | Offline-first `EntriesContext` + sync queue | CloudKit, free |
| Domain logic | `src/shared/` (188 lines) + `src/compute.ts` (331) | Ported to Swift (T-01 – T-05) |
| Tests | 267 lines, Vitest, colocated | Ported near line-for-line |
| Privacy label | would be `Financial Info: Linked to You` | `Data Not Collected` |

Design intent for the code being ported lives in the Obsidian vault: `Components/Shared Domain Helpers.md`,
`Components/Client Domain Logic.md`, `Components/Serverless Backend.md`.
