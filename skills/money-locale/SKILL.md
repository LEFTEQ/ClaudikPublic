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

The divide-first form drifts under IEEE 754 — with `platformFee = 11`, `refundAmount = 15`, `customerTotal = 22`, `11 * (15 / 22)` is `7.499999999999999` and rounds to 7, while `(11 * 15) / 22` is exactly `7.5` and rounds to 8.

⚠️ Sum-invariant cancellations can hide this — write targeted tests on the **proportional component**, not just the totals.

## Guard formatters with `Number.isFinite` at entry

Any formatter writing to XML / CSV / accounting exports / external APIs must reject non-finite input loudly. `formatMajor(NaN)` emits literal `'NaN.NaN'` — XSD validation then fails at the bank, not in tests. NaN propagates silently through `Math.abs` / `Math.floor` / `%` / `toFixed`.

## Grouping separators are not ASCII spaces — and differ by locale

`(123456).toLocaleString('cs-CZ')` returns `'123 456'`: the thousands separator is a no-break space (U+00A0), not a regular space, and the `cs-CZ` currency format puts another U+00A0 before `Kč` (`'1 234,50 Kč'`). Other EU locales differ — in current ICU (Node, Bun, Chromium) `sk-SK`, `pl-PL`, `hu-HU` and `sv-SE` also emit U+00A0, `fr-FR` emits a narrow no-break space (U+202F), and `de-DE`, `it-IT` and `nl-NL` use `.`. The character can change between ICU/CLDR versions, so never hard-code an expectation from memory.

Tests failing with "strings look identical but aren't" are usually a no-break space versus a space. Assert against the escaped character (`'123 456'`), build the expected string with the same `Intl.NumberFormat` call, or normalise `/[  ]/g` to `' '` on both sides before comparing.

## Per-line vs per-rate tax rounding drifts — check the jurisdiction

Rounding the tax on every invoice line and summing can differ from the tax computed on the summed base — by up to N × 0.5 of the minor unit on N lines. Random amounts mostly cancel, but repeated identical lines all round the same way, so the drift grows with the line count and the invoice's per-rate tax summary stops reconciling.

Which computation is allowed, and the unit the tax is rounded to, is set by the jurisdiction — check it, and match the accounting system the invoice feeds. In CZ (DPH), § 37 of the VAT Act defines the bottom-up (base × rate) and top-down (gross − gross ÷ coefficient) methods, which give the same tax since the 2019 amendment; it does not prescribe per-line versus per-rate computation, and rounding the payable total to the nearest whole crown stays outside the tax base. Computing the tax per rate from the summed base keeps base + tax = total on the per-rate summary; per-line computation needs the rounding difference reconciled into that summary.

## Don't round per entry — keep exact units, round once at presentation

`(durationMinutes / 60).toFixed(2)` rounds each entry to 0.01 h (36 s) — up to 0.005 h off per entry, and the error accumulates once the rounded values are summed for payroll, minimum-wage floors or invoices. `toFixed` also rounds the binary value, not the decimal you see: `(1.005).toFixed(2)` is `'1.00'`. Store exact integer minutes (or seconds), sum those, and convert and round once — at presentation or on the invoice line, in the unit and direction the contract or jurisdiction requires.

## Duplicated business formulas demand a cross-service consistency test

When the same calculation (commission/cut/refund formula) lives in N services, write **ONE** test mounting all N services and sweeping a shared input matrix asserting identical outputs — catches drift each service's own specs miss.
