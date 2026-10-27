# UX/UI implementation tracker — audit 2026-10

Source: `docs/ux-review.md` follow-up audit (Oct 2026). Every item from the audit is
listed here. Status: `[ ]` todo · `[~]` partial (what landed / what did not) · `[x]` done
· `[!]` blocked (reason and follow-up recorded) · `[-]` deliberately dropped (reason).

Definition of done for a batch: `npm run lint`, `npm run test`, `npm run build`, and the
full Playwright suite green (260/260 on the final tree).

## Batch 1 — correctness bugs

- [x] **LANG-1** `/hi` runtime `lang` reset to `en` after hydration. `setLanguage` no
      longer touches `lang` on URL-pinned routes; the layout effect owns it. Covered by a
      new e2e assertion on `/hi` (post-hydration `lang === "hi"`, Devanagari line-height).
- [x] **LANG-2** `lang` follows `activeLanguage` on app-shell pages (theme/language
      toggle no longer leaves a stale attribute).
- [x] **INSTALL-1** Android now receives the native `beforeinstallprompt`; the dead
      "APK download card" branch and the `isAndroidOS` suppression are gone.
- [x] **THEME-1** Single `theme-color` meta, repainted by `applyTheme` and the pre-paint
      script; manifest `theme_color` / `background_color` match `--surface-muted`;
      manifest `lang` is `en-IN`.
- [x] **HINT-1** First-visit hint moved inside the planner panel, above the composer, and
      reduced to one line. It can no longer sit behind the fixed bottom bar (measured at
      360×640: hint 437–495, nav starts 585).
- [x] **GALLERY-1** One example per group (3) with a "More examples" disclosure; short
      phones drop the greeting and the third group so no row is cut mid-button; a fade
      mask on the scroll edge signals overflow. Covered by `welcome-gallery.e2e.js`.
- [x] **NAV-1** Create is an action, never a current tab: it focuses the planner on home
      and keeps its bold weight. `nav-active-state.e2e.js` pins both behaviours.
- [x] **EXAMS-1** `notificationDisplayTitle()` picks the reader's half of a bilingual
      scraped title, takes the first sentence, and clamps at a word boundary. Cards also
      clamp to 3 lines. Unit-tested.
- [x] **PAPER-1** Exam-paper CTA now says "invite-only early access" (it is an
      entitlement gate, not just sign-in).
- [x] **HEADER-1** Language is a labelled pill ("हिंदी" / "English"), not a globe with a
      stacked code.
- [x] **HEADER-2** Mobile header is 4 actions (language, bell, sign-in, menu). Theme moved
      to the hamburger below 1024px and stays in the desktop header.
- [x] **SEARCH-1** Practice/exams placeholders shortened to "Search exams…" /
      "Search notifications…".
- [x] **TEST-1** Auto-advance label shortened to one line.
- [x] **TEST-2** Question palette pill gained the list icon and a count-bearing
      accessible name.
- [x] **TYPE-1** Tabular numerals on the timer (already), palette count, score ring.

## Batch 2 — first-run and returning-user experience

- [x] **HOME-1** The panel now claims the dead band between itself and the bottom bar
      (`100dvh − 200px`), the gallery shows 3 whole rows, and the composer is visible at
      every tested height (360×640/720/800). The composer stays bottom-anchored by design;
      the examples, not the input, were the problem.
- [x] **HOME-2** First-run streak is one line + one action; the week grid and four badge
      tiers render only after the first test or an existing streak.
- [x] **HOME-3** Returning users get a "Weakest topic — N% average · practice 10 questions"
      card in the idle panel, wired to the previously unused `buildTopicMasteryItems`.
- [x] **HOME-4** Added a specific subline ("Free practice for SSC, UPSC, NEET & CBSE"). The
      H1 text itself is kept: it is pinned as a one-line kicker by `home-layout.e2e.js`.
- [x] **PRACTICE-1** Exam cards show stream · questions · duration.
- [x] **RESULTS-1** Verdict band: Needs work / On track / Strong, with one next step.
- [x] **RESULTS-2** Target score chips (60/75/85%), persisted; "N points ahead / to go".
      An honest alternative to invented cut-offs.
- [x] **RESULTS-3** Share is a white/teal outlined action above the primary CTA (was beige).

## Batch 3 — performance and slow networks

- [x] **PERF-1** The composer is a real form (`action="/" method="get" name="q"`). Before
      hydration Enter performs a GET; after hydration `?q=` is turned into the first
      planner turn. The URL keeps the query (shareable) and a one-shot session marker
      makes a refresh a no-op instead of a second generation. Verified with a stubbed
      parse-intent call (message appears once, reload only prefills).
- [x] **PERF-2** Manual config (`TopicBrowser` + `ExamBrowser`) is dynamically imported on
      first open. Measured saving is ~3.3 KB gzip, not the 10–15 KB first assumed — the
      components are small; `indianExams` is the bulk.
- [x] **PERF-3** The shell's `lite` budget now also controls the planner ring (save-data /
      2G–3G / ≤3 GB RAM / ≤2 cores — stricter than the playground's artifact bucket so a
      4-core laptop keeps the full experience). Reduced motion is excluded: it must freeze
      the static gradient, not delete it.
- [-] **PERF-4** `content-visibility` on exam/history cards — dropped. The longest list is
      101 cards, and the gain does not justify blank areas in full-page screenshots,
      scroll-anchoring changes, or the risk to `design-consistency`.
- [-] **PERF-5** Duplicate `/api/personalize` calls — no duplicate call site exists; the
      repeated requests in dev logs came from repeated page loads.
- [!] **PERF-6** Per-route dictionary split. Blocked on an i18n runtime redesign (the
      synchronous `t()` + single `english.json` import). Plan: namespace dictionaries
      (home/test/results/exams/account/legal), make `t()` resolve lazily per route, and
      keep English as the fallback. Expected saving ~12 KB gzip on non-home routes.

## Batch 4 — features for the audience

- [x] **FEAT-1** Timed papers: countdown when `examMeta.durationMinutes` exists, red in
      the last 5 minutes, auto-submit once at zero. Pattern papers also surface their
      marking scheme before the start ("6 marks", "−0.5 for a wrong answer") and per
      section during the attempt ("2 marks each · −0.5 if wrong"). Grading already used
      `computeAttemptMarks`. Section locking is deliberately **not** enforced: the palette
      and Back/Next stay available, matching the exam-day navigation most candidates know.
      Verified live and pinned by `tests/e2e/timed-sections.e2e.js`.
- [x] **FEAT-2** Weak-topic card (see HOME-3).
- [x] **FEAT-3** Exam countdown card on home: the nearest dated exam (profile/bookmarked
      exam wins), read from the bell's session feed cache or its fetch event — no extra
      request. Pinned by `tests/e2e/home-exam-countdown.e2e.js` (appears with a date,
      absent without one).
- [x] **FEAT-4** Voice input (`hi-IN` / `en-IN`) on the composer when the browser supports
      it; permission only after a tap; mic replaces the search button on phones (which is
      still reachable by typing a test ID) so the input stays 180px wide at 360px.
- [x] **FEAT-5** "Report this question" already existed end-to-end; verified and left as is.
- [!] **FEAT-6** Offline paper packs — grading is server-side and the paper leaves the
      server without the key, so an offline attempt cannot be scored. Needs either an
      offline key policy or a deferred-grading queue. Not shippable as a checkbox.
- [!] **FEAT-7** PYQ bank / cut-off tables — needs a licensed/curated question bank and
      published cut-off data with a source per exam.
- [!] **FEAT-8** Daily current affairs — needs a verified news source; model-generated
      current affairs would hallucinate.
- [!] **FEAT-9** Teacher/parent progress link — needs a privacy/consent decision and a
      scoped share token.
- [!] **FEAT-10** Additional regional languages — translation + QA per language.

## Batch 5 — re-audit

- [x] 320/360/390 screenshots, 3G profile, header/hint/panel measurements re-run on the
      production build.
- [x] `npm run lint`, `npm run test` (1143 unit tests), `npm run build`.
- [x] Full Playwright suite: **260/260 passed**.
- [x] Pinned specs updated where behaviour intentionally changed: `welcome-gallery`
      (3 + More), `nav-active-state` (Create is not a tab), `public-pages` (theme in the
      menu on phones, Hindi `lang`), `streak-home` (compact first-run card).

## Final evidence

| Check | Before | After |
|---|---|---|
| `/hi` runtime `lang` | `en` | `hi`, line-height ratio 1.6 |
| Header at 360px | 5 icons, 2px spare | 4 actions, language pill, theme in menu |
| First-visit hint at 360×640 | bottom 48px under the nav | fully inside the panel (437–495 vs nav 585) |
| Welcome examples visible at 360×640 | 1–2, third cut | 3 whole rows + More (scroll edge fading) |
| Composer placeholder at 360 | clipped at ~128px input | `What to practice?` in a 180px input |
| Home first load JS | 138 KB gzip | 138 KB gzip (manual config ~3 KB deferred) |
| Results hero | neutral ring only | verdict band + target comparison |
| Timed paper | elapsed only | countdown + auto-submit when duration exists |
| Pattern paper start | no marking scheme | "6 marks · −0.5 for a wrong answer" |
| Section view | name only | name, "2 marks each · −0.5 if wrong", suggested minutes |
| Home | no exam context | nearest dated exam from the cached feed, no extra request |
| Full suite | 255/255 baseline | 260/260 (5 new assertions across 3 specs) |

## Deliberately not done (and why)

The audit's content-heavy features (PYQ bank, cut-offs, current affairs) cannot be
implemented honestly without licensed/content data. The two architectural items (i18n
dictionary split, offline grading) are scoped above with expected savings and the decision
they need. Everything else in the audit is either shipped or recorded as blocked above.
