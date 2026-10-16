# Test activity card visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the test activity card as soon as more than one visitor has seen the test or result page (`visitors >= 2`), so the visitor count is visible even with zero or one submissions. Everything else the operator asked for (in-progress status, scores of people who took the test, the viewer's own score) already renders in the card and stays as-is.

**Architecture:** One-line gate change in `src/lib/client/TestStatsCard.svelte` — the card already mounts on both target surfaces (the `/test` summary and `/results`) and the `/api/test/stats` payload already carries `visitors`. The two e2e specs that pin the old gate get surgical assertion updates (recorded test changes). No server, API, payload, i18n, or full-stats-page changes.

**Tech Stack:** Svelte 5 runes component, Playwright e2e (dev server on port 5174 with in-memory PGlite, seeding through the `/api/test/db` bridge), intent records under `.intent/changes/`.

**Spec:** `docs/superpowers/specs/2026-10-16-test-stats-visibility-design.md`

## Global Constraints

- Never weaken an assertion: the flipped points must assert the full new state (tiles, score rows, my-score presence/absence) at least as strictly as the old hidden assertions. The two single-visitor hidden assertions stay untouched.
- Both pre-existing tests modified must be declared in CHG-0027's `test_changes` with reasons, in the same change.
- No new locale strings, telemetry events, or server changes. No changes to `/test/stats` or the stats payload.
- Semicolons, single quotes, tabs. Every commit runs the pre-commit hook (lint + unit + full e2e, ~2 min).
- Do not touch any file outside the three declared paths plus the CHG-0027 record.

## Review Focus

- **Single-visitor surfaces stay hidden**: the creator alone (`test-stats.e2e.js` first-visitor check) and the lone challenge taker (`test-stats.e2e.js` second test) — both assertions unchanged, both still `toHaveCount(0)`.
- **The 2-visitors / 0-submissions state renders cleanly**: tiles 2/0/0, no score rows, no my-score — asserted, not just "visible".
- **The layout audit keeps its coverage**: `design-consistency.e2e.js` must still render the card at every width after the gate flips, via the seeded visits.
- **The count includes the viewer**: two browsers (creator + visitor) must produce `visitors = 2`, proving the stats fetch records the caller before counting.
- **No collateral rendering change**: score rows and my-score appear exactly when submissions exist (1 submission → 1 row + my-score for the taker; creator sees no my-score).

---

### Task 1: Open CHG-0027

**Files:**
- Create: `.intent/changes/CHG-0027/proposal.md`

**Interfaces:**
- Consumes: the spec (`docs/superpowers/specs/2026-10-16-test-stats-visibility-design.md`).
- Produces: the change record every later step references; `status: "draft"` until Task 2's conformance.

- [ ] **Step 1: Write the proposal**

Copy `.intent/changes/TEMPLATE/proposal.md`. Fill:

- `id: "CHG-0027"`, `title: "Show the activity card once more than one visitor has seen the test"`, `status: "draft"`, `created_at` from `date -u +%Y-%m-%dT%H:%M:%SZ`.
- `request`: "show how many people have visited the shared test page as soon as more than one user has seen the test or result page, at minimum the visitor count".
- `scope.paths`: `["src/lib/client/TestStatsCard.svelte", "tests/e2e/test-stats.e2e.js", "tests/e2e/design-consistency.e2e.js"]` (narrow; no `.intent/**`).
- `test_changes`:
  - `path: "tests/e2e/test-stats.e2e.js"`, `kind: "modified"`, reason: "Four visibility points flipped from hidden to visible under the visitors-based gate, each gaining tile/score/my-score assertions for the new state; the two single-visitor hidden assertions are unchanged. No assertion was weakened."
  - `path: "tests/e2e/design-consistency.e2e.js"`, `kind: "modified"`, reason: "The layout audit's probe test seeds two `ai_test_visits` rows so the card still renders under the visitors-based gate; all layout assertions are unchanged."
- `links.related: ["CHG-0010", "CHG-0025"]` (display names on the public stats; the spec this record's test file was last touched by).
- Body sections: Outcome, Scope (included: the gate change; excluded: the app's counting rules, the full stats page, other surfaces), Preserved behavior, Test changes (the two above), Decisions (gate lives in the component; calendar counting unchanged), Verification plan (the focused red/green runs and the full suite in Task 2), and a `Design: docs/superpowers/specs/2026-10-16-test-stats-visibility-design.md` line.

- [ ] **Step 2: Pin the digest**

Run: `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0027 --print-digest`
Paste the printed digest into `proposal.digest`. Then run the same command without `--print-digest`; expect digest match (scope warnings for not-yet-changed files are fine).

- [ ] **Step 3: Commit**

```bash
git add .intent/changes/CHG-0027/proposal.md
git commit -m "chore(intent): open CHG-0027 for the activity card visibility gate"
```

---

### Task 2: Flip the gate, update the two specs, complete the record

**Files:**
- Modify: `src/lib/client/TestStatsCard.svelte` (gate expression + comment, lines ~11-14)
- Modify: `tests/e2e/test-stats.e2e.js` (four visibility points + four comment updates)
- Modify: `tests/e2e/design-consistency.e2e.js` (visit seed + comment)
- Create: `.intent/changes/CHG-0027/conformance.md`; modify the proposal's `status`.

**Interfaces:**
- Consumes: CHG-0027 from Task 1.
- Produces: the shipped behavior — card visible when `stats.visitors >= 2`.

- [ ] **Step 1: Update `tests/e2e/test-stats.e2e.js` (red first)**

In the test `visitors, in-progress and submissions across two visitors`, make these four changes (keep every surrounding step and assertion; the snippets are exact):

1. Second visitor arrives (currently asserts `toHaveCount(0)` with the comment "both visits count, but with no submissions yet the activity card stays hidden"):

```js
	// Second visitor: both visits count, and two visitors are enough for the
	// activity card even before any submission: tiles only, no score list.
	// (comment replaces the old "stays hidden" comment; the goto/fetch lines
	// above it are unchanged)
	await expect(visitorPage.locator('.test-stats-card')).toBeVisible();
	await expect(
		visitorPage.locator('[data-metric="visitors"] .test-stats-value')
	).toHaveText('2');
	await expect(
		visitorPage.locator('[data-metric="inProgress"] .test-stats-value')
	).toHaveText('0');
	await expect(
		visitorPage.locator('[data-metric="submissions"] .test-stats-value')
	).toHaveText('0');
	await expect(visitorPage.locator('.test-stats-score-row')).toHaveCount(0);
	await expect(visitorPage.locator('.test-stats-my-score')).toHaveCount(0);
```

2. After the visitor submits and lands on results (replace the `toHaveCount(0)` and its "One submission or none is not activity" comment):

```js
	// Two visitors keep the card visible for the taker on the results page:
	// one submission, the taker's own score line, one public score row.
	await expect(visitorPage.locator('.test-stats-card')).toBeVisible();
	await expect(visitorPage.locator('.test-stats-my-score')).toContainText('1/2');
	await expect(
		visitorPage.locator('[data-metric="submissions"] .test-stats-value')
	).toHaveText('1');
	await expect(visitorPage.locator('.test-stats-score-row')).toHaveCount(1);
```

3. Visitor returns to the test summary (replace `toHaveCount(0)`):

```js
	await expect(visitorPage.locator('.test-stats-card')).toBeVisible();
	await expect(
		visitorPage.locator('[data-metric="submissions"] .test-stats-value')
	).toHaveText('1');
```

4. First visitor (creator) opens the summary before submitting (replace `toHaveCount(0)`):

```js
	// The creator sees the card before their own run: two visitors, one
	// submission, and no own-score line yet.
	await expect(page.locator('.test-stats-card')).toBeVisible();
	await expect(page.locator('[data-metric="visitors"] .test-stats-value')).toHaveText('2');
	await expect(page.locator('[data-metric="submissions"] .test-stats-value')).toHaveText('1');
	await expect(page.locator('.test-stats-score-row')).toHaveCount(1);
	await expect(page.locator('.test-stats-my-score')).toHaveCount(0);
```

Comment-only updates (no assertion changes): the "A second submission gives the card something to compare" comment becomes "A second submission adds the second public score and the creator's own row; the card was already visible with two visitors."; the second test's "This taker's single submission keeps the activity card hidden." becomes "A lone visitor keeps the activity card hidden: it needs a second one."

- [ ] **Step 2: Update `tests/e2e/design-consistency.e2e.js`**

In `test start, stats and results stay fluid at every width`, update the probe-test comment and add the visit seed after the attempts insert:

```js
	// The activity card shows with 2+ visitors, so a second probe test carries
	// seeded visits and attempts: the card layout beside the summary is still
	// audited, while the first test keeps the no-card state covered.
```

```js
	await sql`
		INSERT INTO ai_test_visits (test_id, identity_key)
		VALUES (${statsTestId}, 'c:seed-layout-a'), (${statsTestId}, 'c:seed-layout-b')
	`;
```

(`first_seen_at`/`last_seen_at` default; the audit visitor's own visit is the third. No other change in this spec.)

- [ ] **Step 3: Run red**

Run: `npx playwright test tests/e2e/test-stats.e2e.js tests/e2e/design-consistency.e2e.js`
Expected: `test-stats.e2e.js` FAILS at the new second-visitor assertions (card still hidden under `submissions >= 2`); `design-consistency.e2e.js` passes (unchanged behavior pre-gate). Capture the failure text.

- [ ] **Step 4: Flip the gate**

In `src/lib/client/TestStatsCard.svelte`, replace:

```js
	// Shown only when there is something to compare: at least two submissions.
	// A single submission is the viewer's own run (their score already leads
	// the results page), and none means no activity worth a card.
	const visible = $derived(Number(stats?.submissions || 0) >= 2);
```

with:

```js
	// Shown once more than one identity has seen the test: the visitor count
	// is the minimum this card promises. A single visitor (usually the creator
	// alone, or a lone taker whose score already leads the results page) sees
	// nothing.
	const visible = $derived(Number(stats?.visitors || 0) >= 2);
```

- [ ] **Step 5: Run green**

Run: `npx playwright test tests/e2e/test-stats.e2e.js tests/e2e/design-consistency.e2e.js`
Expected: both files pass. Then run `npm run lint` and `npm run test` (unit; `testStats.test.js` must stay green untouched).

- [ ] **Step 6: Full suite**

Run: `npm run test:e2e`
Expected: full suite green (233 tests; the history-groups spec is time-of-day independent since CHG-0026). Capture the pass count.

- [ ] **Step 7: Write the conformance and complete the record**

Write `.intent/changes/CHG-0027/conformance.md` using the template: outcome vs the spec, the real verification results from steps 3/5/6 (red output, green output, full-suite count), confirm the two declared test changes, note "None" deviations (or any), and "Not required" approval. Set `status: "complete"` in the proposal's front matter (front-matter edit; digest unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/lib/client/TestStatsCard.svelte tests/e2e/test-stats.e2e.js tests/e2e/design-consistency.e2e.js .intent/changes/CHG-0027/conformance.md .intent/changes/CHG-0027/proposal.md
git commit -m "feat(stats): show the activity card once more than one visitor has seen the test"
```

- [ ] **Step 9: Verify the record**

Run: `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0027 --base <parent-of-commit> --head <commit>` (pin `--head` to the commit just created; without `--head` the check also sweeps untracked files). Expected: exit 0 — digest matches, changed paths within declared scope.
