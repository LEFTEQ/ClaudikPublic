---
name: money-locale
description: "Use when writing or reviewing code that handles money, VAT/DPH, invoices, payroll, or duration-to-hours math, or formats numbers for cs-CZ/EU locales or CSV/XML exports — also when a test fails on strings that 'look identical but aren't', or the same calculation exists in two services."
---

# Numeric & locale gotchas

## Integer money math — multiply first, then divide

```ts
Math.round((platformFee * refundAmount) / customerTotal)   // correct
Math.round(platformFee * (refundAmount / customerTotal))   // WRONG
```

The float-first form drifts under IEEE 754 — e.g. `(15/22)*11` rounds to 7, not the correct 8.

⚠️ Sum-invariant cancellations can hide this — write targeted tests on the **proportional component**, not just the totals.

## Guard formatters with `Number.isFinite` at entry

Any formatter writing to XML / CSV / accounting exports / external APIs must reject non-finite input loudly. `formatMajor(NaN)` emits literal `'NaN.NaN'` — XSD validation then fails at the bank, not in tests. NaN propagates silently through `Math.abs` / `Math.floor` / `%` / `toFixed`.

## `cs-CZ` uses NBSP as the thousands separator

`(123456).toLocaleString('cs-CZ')` returns `'123 456'` with a non-breaking space ` `, not a regular space — true for most EU locales. Tests failing with "strings look identical but aren't" are usually NBSP-vs-space. Assert with `' '` explicitly, or strip whitespace before comparing.

## Per-line vs end-of-invoice tax rounding drifts ≈ N × 0.5 cents

Czech VAT/DPH on itemized invoices: prefer **end-of-invoice rounding** for commission-style invoices. Per-line rounding accumulates phantom over-collection — 7 cents on a 100-line invoice trips audit reconciliation.

## `toFixed` accumulates precision loss — store integers

`(durationMinutes / 60).toFixed(2)` loses ~0.0033h per non-multiple-of-60 — minutes per 1000 jobs. For payroll and minimum-wage floors, store integer centi-hours via `Math.round(durationMinutes * 100 / 60)`; format only at presentation.

## Duplicated business formulas demand a cross-service consistency test

When the same calculation (commission/cut/refund formula) lives in N services, write **ONE** test mounting all N services and sweeping a shared input matrix asserting identical outputs — catches drift each service's own specs miss.
