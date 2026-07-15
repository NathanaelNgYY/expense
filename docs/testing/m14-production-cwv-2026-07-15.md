# M14 production performance reassessment

**Date:** 2026-07-15 (SGT)  
**Target:** `https://budget-tracker-sooty-ten.vercel.app`  
**Runner:** Lighthouse 13.0.1, Chrome 150.0.7871.116

## Method

Three fresh navigation runs were collected for each Lighthouse mobile and desktop profile against the production alias. Medians are reported to reduce the effect of throttling and network variance. These are lab measurements, not CrUX field data. Google PageSpeed Insights returned HTTP 429 during the measurement window, so no claim is made about real-user LCP, CLS, or INP.

## Results

| Profile | Performance | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mobile run 1 | 91 | 2.024s | 2.708s | 174ms | 0 |
| Mobile run 2 | 94 | 1.934s | 2.505s | 121ms | 0 |
| Mobile run 3 | 97 | 1.756s | 2.409s | 18ms | 0 |
| **Mobile median** | **94** | **1.934s** | **2.505s** | **121ms** | **0** |
| Desktop run 1 | 100 | 0.390s | 0.590s | 0ms | 0 |
| Desktop run 2 | 100 | 0.397s | 0.617s | 0ms | 0 |
| Desktop run 3 | 100 | 0.386s | 0.633s | 0ms | 0 |
| **Desktop median** | **100** | **0.390s** | **0.617s** | **0ms** | **0** |

INP is a field/interaction metric and is not available from a navigation-only Lighthouse run. TBT is retained as a lab responsiveness diagnostic, not relabelled as INP.

## Diagnosis

- The LCP element is onboarding body text, not an image. One diagnostic run attributed roughly 36ms to time-to-first-byte and 574ms to element render delay.
- The largest Lighthouse unused-JavaScript opportunities were the Supabase chunk (42.3 KiB estimated unused of 55.3 KiB) and the app entry chunk (32.6 KiB estimated unused of 64.4 KiB).
- The mobile LCP median is 5ms above the 2.5s “good” boundary, but the three-run range is 2.409–2.708s and an additional diagnostic run completed at 1.741s. CLS is consistently zero, TBT remains below 200ms, and desktop is comfortably fast.

## Decision

Do not perform another loading-boundary refactor yet. Deferring the Supabase chunk would touch identity activation, migration, offline queue replay, personal sync, and shared-budget auth. The correctness risk is disproportionate to a 5ms lab-only median miss with high run-to-run variance. Keep the 143 KiB initial-JavaScript CI budget, collect real-user/CrUX data when available, and reopen M14 if field LCP exceeds 2.5s or field INP exceeds 200ms consistently.
