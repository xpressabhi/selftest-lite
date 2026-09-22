# Results hero — "Spotlight" redesign

- **Date:** 2026-09-22
- **Status:** approved, ready for implementation planning
- **Surface:** `src/routes/results/+page.svelte` (`/results`)

## Context

The results page is the moment a learner sees what their effort produced. Today that moment is a
plain card: a muted topic line, a 72px ring, and a vertical list of actions and settings. Commit
`8560028` ("compact, mobile-first result card") already cut the card from 528px to 355px on a 390×844
phone and demoted secondary controls into a collapsed *More actions & settings* section. The
structure improved; the feeling did not. Feedback on the result: *"still poor design, no wow factor."*

This design keeps the compactness and replaces the visual language with a dark, focused **Spotlight**
hero, moves the primary next step inside the hero, and gives every remaining control a deliberate
home instead of a generic disclosure.

Reference material (Dribbble sweep, 2026-09-22): gradient stat cards and a "Score card" CTA
(dribbble.com/shots/20778806), stat strip + comparison line + "You lost marks here"
(dribbble.com/shots/26977992), celebration language from the IELTS achievement poster
(dribbble.com/shots/26199285). Local mockups from the session live in
`.superpowers/brainstorm/8603-1790061314/content/` (gitignored).

## Goals

1. Make the result moment feel like a milestone without adding clutter.
2. Keep exactly one primary next step, inside the hero, adapted to the attempt.
3. Add a personal comparison line — the same data the page already loads.
4. Relocate (not delete) print, retake, auto-explain, rating, reminder, and the test ID.
5. Stay inside the repo's performance rules: no webfonts, no images, low-end Android baseline,
   data-saver and reduced-motion respected, EN + HI copy.

## Non-goals

- No change to paper generation, grading, storage schema, or the shareable canvas score card
  (`src/lib/client/scoreCard.js`).
- No change to the test-taking page or the practice flow.
- No new telemetry events; no removal of existing ones.
- No structural change to the answer review list, filter bar counts, or the learning panels.

## Current baseline (for the implementer)

- `.result-summary` card: `.result-topic`, `.result-hero` (72/88px `.score-ring` + `.result-figures`
  with `.result-score` and `.result-meta`), `.result-primary` (`.result-cta` + `.result-links`),
  `.reminder-teaser`, and the `.card-more-*` disclosure containing retake, review,
  print/share/card, auto-explain, rating, reminder controls, and the test ID.
- Count-up and ring settle are driven by `displayedPercentage` / `scoreSettled`, gated by
  `shouldCountUp({ dataSaver, reduceMotion })` from `src/lib/client/countUp.js`; `HAPTIC_SUCCESS`
  fires when the count-up settles.
- `shareResult()` (link; tracks `results:share`) and `shareCard()` (canvas image; tracks
  `results:share-card`) both exist and are unchanged by this design.
- Locale test (`src/lib/locales/locales.test.js`) enforces EN/HI key parity and non-empty strings;
  unused keys are not policed.

## Design

### 1. Hero card — Spotlight

One dark "stage" card on the light page, replacing `.result-summary`'s white card styling.

- **Surface:** `linear-gradient(160deg, #0b1120, #141b33)` plus two decorative radial glows
  (violet `rgba(124,58,237,.55)` top-left, teal `rgba(13,148,136,.4)` bottom-right). 1px
  `rgba(255,255,255,.1)` border, 22px radius, soft outer shadow. Three static `✦` glyphs at
  `rgba(255,255,255,.35)` — decorative, `aria-hidden`.
- **Header row:** eyebrow label *Result* (10px, 0.18em, uppercase, `#a5b4fc`) and a 34px glass share
  button (44px hit area) opening the share sheet (§4).
- **Topic:** white, 15–16px, `font-weight: 650`, max two lines.
- **Score block:** SVG ring, 140px on mobile / 168px at ≥480px, `stroke-width: 8`, track
  `rgba(255,255,255,.12)`, progress in a gradient `#a5b4fc → #22d3ee`, `stroke-linecap: round`,
  soft radial glow behind. Inside: the counted-up percentage (38/44px, tabular numerals) and
  `{correct} of {total} correct` beneath it.
- **Meta line:** `{time} · {questions}`. Time uses `formatDuration` with existing short units;
  questions use the existing `questionsCountFormat`.
- **Comparison pill:** §2.
- **Primary CTA:** full-width 48px button with `linear-gradient(120deg, #6366f1, #22d3ee)` and dark
  ink `#06121f`; label `⚡ Practice {count} weak questions →` when `wrongIndices.length > 0`,
  otherwise `Practice more questions →`. Click behaviour unchanged: `practiceWeakQuestions` /
  `practiceMoreHref()`.
- **Responsive:** card padding 18px mobile / 22px ≥768px; content max-width 860px to match the page.
- **Dark app theme:** the hero stays dark in both themes; in dark mode it gains a slightly stronger
  border (`rgba(255,255,255,.16)`) so it separates from the page background.
- **Print:** `@media print` resets the hero to white background, dark text, no glows; CTA and links
  are already `no-print`.

### 2. Comparison pill

Computed from `getHistory()` once the paper resolves (alongside the existing learning-panel refresh),
excluding the current attempt. Only completed entries with a positive `totalQuestions` count as
previous attempts.

```
previous = history.filter(e => e.userAnswers && e.id !== current.id && e.totalQuestions > 0)
prevPct  = previous.map(e => Math.round((e.score / e.totalQuestions) * 100))
best     = Math.max(...prevPct)
avg      = Math.round(prevPct.reduce((sum, pct) => sum + pct, 0) / prevPct.length)
```

| Condition | State | Pill |
| --- | --- | --- |
| `previous.length === 0` | `baseline` | dashed neutral, `First test — baseline saved` |
| `percentage > best` | `best` | amber, `★ Personal best` |
| `percentage === avg` | `same` | neutral, `= Same as your average` |
| `percentage > avg` | `ahead` | mint, `▲ +{percentage − avg}% vs your average` |
| otherwise | `behind` | neutral grey, `▼ {avg − percentage}% vs your average` |

- Styling: mint `#6ee7b7` on `rgba(16,185,129,.12)`; amber `#fcd34d` on `rgba(245,158,11,.16)`;
  neutral `#cbd5e1` on `rgba(148,163,184,.12)`. Behind is never red and never alarm-toned.
- The pill is hidden until the paper resolves; with no history (fresh browser, private mode) it shows
  the baseline state.
- The helper lives in `src/lib/client/learning.js` as a pure function
  `buildScoreComparison(history, currentTest, percentage)` returning `{ state, delta }` so the
  matrix can be tested directly.

### 3. Actions and placements

Below the hero:

1. **Text links** (`result-link` styling, 44px targets): `Review wrong (N)` (hidden when
   `wrongIndices.length === 0`), `Practice more`, `New quiz`.
2. **Utility row**, muted 12px, wraps: `Print` · `Retake` · `Test ID: …` · bookmark count chip
   (when > 0) · reminder teaser (when notifications are supported, history ≥ 1 attempt, and
   reminders are off). The teaser keeps the single-line form from commit `8560028`, but scrolls to
   the page-footer reminder control and focuses the toggle.

Relocations (the `.card-more-*` disclosure is deleted):

| Control | Was | Becomes |
| --- | --- | --- |
| Auto-explain toggle | More section | Full-width row immediately below the filter bar, right-aligned at ≥768px (data-saver disabled state kept) |
| Rating 👍/👎 | More section | Page footer, after the question list |
| Reminder opt-in + time select | More section | Page footer (teaser in the utility row) |
| Print | More section | Utility row |
| Retake (+ confirm) | More section | Utility row |
| Share / Card buttons | More section | Share sheet behind the hero's share button (§4) |
| Review wrong / Practice more | More section + primary area | Hero CTA and under-hero links |
| Test ID | More section | Utility row, tiny muted text |
| Bookmark count | More section | Utility row chip |

### 4. Share sheet

Tapping the hero share button reveals an inline sheet under it (inside the hero card, dark surface):

- `Share result link` → existing `shareResult()`.
- `Share score card` → existing `shareCard()`.

Behaviour: first item takes focus on open; selecting an item, `Escape`, or an outside tap closes it and
returns focus to the share button; tracking stays exactly `results:share` and `results:share-card`.
Fallbacks (clipboard, file download, toasts) are untouched.

### 5. States and edge cases

- **All correct:** no wrong answers → CTA is `Practice more questions →`; the `Review wrong` link is
  absent; the comparison pill is usually `Personal best` or `ahead`.
- **Zero score with wrong answers:** ring shows 0%, CTA is practice-weak; the ring count-up effect
  still settles.
- **Skipped questions:** no hero change; the filter bar's `Skipped` chip keeps its count.
- **Loading/error:** untouched.
- **Challenge card:** untouched, stays directly below the hero.
- **Data-saver / reduced motion:** no count-up (final percentage immediately), no ring settle
  animation, no new animation anywhere; glows are static CSS.
- **History > 150 entries:** `getHistory()` already caps at 150; the comparison uses what it returns.

### 6. Accessibility

- Ring: `role="img"` with `aria-label="{percentage}%"` (existing pattern).
- Comparison pill: text carries the meaning (`▲`/`▼`/`★` plus words), never colour alone.
- Targets: CTA 48px, links and utility items ≥44px, share button 44px hit area.
- Contrast on `#0b1120`: white ≈ 17:1, `#cbd5e1` ≈ 11:1, mint `#6ee7b7` ≈ 11:1, amber `#fcd34d`
  ≈ 11:1. Focus rings on the dark surface use a light outline (`#a5b4fc`), not the default brand
  ring, so they stay visible.
- The share sheet is reachable and dismissible by keyboard; no focus trap beyond the open state.

### 7. i18n

New keys (EN / HI), all added to both locale files:

| Key | EN | HI |
| --- | --- | --- |
| `resultsHeroEyebrow` | Result | परिणाम |
| `resultsCorrectOf` | {correct} of {total} correct | {total} में से {correct} सही |
| `resultsCompareBest` | ★ Personal best | ★ आपका सर्वश्रेष्ठ |
| `resultsCompareAhead` | ▲ +{delta}% vs your average | ▲ आपके औसत से +{delta}% |
| `resultsCompareBehind` | ▼ {delta}% vs your average | ▼ आपके औसत से {delta}% |
| `resultsCompareSame` | = Same as your average | = आपके औसत के बराबर |
| `resultsCompareFirst` | First test — baseline saved | पहला टेस्ट — आधार दर्ज |
| `resultsPracticeMoreCta` | Practice more questions | और सवालों का अभ्यास करें |
| `resultsShareLink` | Share result link | रिज़ल्ट लिंक शेयर करें |
| `resultsShareCard` | Share score card | स्कोर कार्ड शेयर करें |

Changed copy: `practiceWeak` becomes `Practice {count} weak questions` /
`{count} कमज़ोर सवालों का अभ्यास करें`. Removed key: `cardActionsSettings` (its disclosure is
deleted) from both locales.

### 8. Code touch points

- `src/routes/results/+page.svelte` — hero markup and styles, utility row, answers-header
  auto-explain, footer strip, share sheet state, comparison derived value.
- `src/lib/client/learning.js` — new pure `buildScoreComparison` helper.
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`.
- Tests: new `tests/e2e/results-hero.e2e.js`; touch `tests/e2e/smoke.e2e.js` only if its
  seeded-paper assertion reads hero text.

## Verification

1. `npm run lint`, `npm run check`, `npm run test`.
2. `npm run test:e2e` — new spec covers:
   - seeded completed paper with wrong answers: ring %, `{correct} of {total} correct`, CTA
     `Practice N weak questions`, links, utility row (print/retake/test ID), auto-explain below the
     filter bar, footer rating + reminder;
   - comparison matrix from seeded history: `best`, `ahead`, `behind`, `same`, `baseline`;
   - share sheet: opens, both rows trigger their functions, `results:share` and
     `results:share-card` appear in captured telemetry;
   - data-saver emulation: final percentage immediately, no `settled` class;
   - all-correct paper: CTA swaps to practice-more, no review link.
   The artifact `test-results/e2e-artifact.json` must be produced and stay byte-identical across
   runs on a clean tree.
3. Manual checks per repo checklist: mobile Safari safe areas, 320px width, Slow 3G with data-saver,
   low-end Android profile (no jank on mount), dark mode, print preview (hero prints light), and
   Hindi rendering of the new strings.

## Telemetry

No new events. Existing events keep their meaning and call sites: `results:view`,
`results:share`, `results:share-card`, `results:print`, `results:retake`, `results:explain*`,
`results:challenge-*`. The rating and reminder handlers move with their controls and keep their
current tracking.

## Risks

- **A dark card on a light page can look pasted on.** Mitigated with the hairline border, matching
  860px content width, page-consistent radius, and a deliberate spacing rhythm around it; verify in
  both app themes before merging.
- **Baseline copy can read as a non-result.** The dashed neutral treatment keeps it honest
  ("baseline saved") instead of pretending a comparison exists.
- **Utility row could re-clutter.** Cap it at one wrapped line, 12px muted, with 44px hit areas and
  no button chrome.
