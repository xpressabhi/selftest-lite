# Test activity card visibility: show once more than one visitor

## Context

The "Test activity" system (introduced in `6d7618b`) tracks per-identity visits to a test:

- `ai_test_visits` holds one row per identity per test (`identity_key` = `u:<userId>` when signed in, else `c:<clientId>`), with `first_seen_at`, `last_seen_at`, `started_at` (answered the first question), `submitted_at`, and an optional display name.
- Visits are recorded when a visitor opens the test page (`view` ping), answers their first question (`start` ping), submits (server-side), or loads the stats card itself (`GET /api/test/stats` records the caller before computing counts).
- `getTestStats` (`src/lib/server/testStats.js`) returns `{ visitors, inProgress, submissions, scores, myAttempt, viewer, isOwner, daily }`.
- `TestStatsCard` renders on the **test start screen** (`src/routes/test/+page.svelte`, summary next to Share / Print / Start) and on the **results page** (`src/routes/results/+page.svelte`). It shows three tiles (Visitors / In progress / Submitted), up to five named score rows for people who submitted, the viewer's own score when they have an attempt, and a link to the full `/test/stats?id=` page.
- The full stats page is never gated.

The card's current visibility gate is **`submissions >= 2`** (`src/lib/client/TestStatsCard.svelte`): it stays hidden when a test has many visitors but fewer than two submissions. The operator wants the card visible as soon as **more than one user has seen the test or result page**, so that at minimum the visitor count is always shown once a test has more than one viewer.

## Objective

Show the test activity card when **`visitors >= 2`** instead of `submissions >= 2`. Everything the operator asked for beyond the count already exists in the card and needs no change: in-progress status (aggregate tile), scores of people who took the test (score rows), and the viewer's own score (`myScore` line).

## Non-goals

- No per-person visitor list and no explicit "you are in progress" line (operator chose the aggregate view).
- No server, API, payload, database, or visit-recording changes.
- No new locale strings or telemetry events.
- No change to the full stats page or to card placement on either surface.

## Decisions

- **D1 — Gate lives in the component.** `visible = Number(stats?.visitors || 0) >= 2` in `TestStatsCard.svelte`. The payload already carries `visitors`; the server does not decide presentation.
- **D2 — Content unchanged.** Tiles, score rows, my-score line, and the details link render exactly as today; at low activity the score list and my-score simply stay absent (they already render conditionally).
- **D3 — Both surfaces unchanged.** The card already mounts on the test start screen and the results page; no placement or mount-condition changes.
- **D4 — Counting unchanged.** Identities are account-based when signed in and device-based otherwise; the viewer's own visit is recorded by the stats fetch before counts are computed, so the viewer is always included in the number they see. One person signed out on two devices still counts as two visitors (existing approximation, out of scope).
- **D5 — The full stats page stays ungated** (it is the "details" destination and always shows).
- **D6 — A single visitor stays hidden.** A lone creator (or a lone taker, whose score already leads the results page) sees nothing; the card's minimum promise starts at the second visitor.

## Behavior

| visitors | submissions | card |
| --- | --- | --- |
| 1 | 0 | hidden (unchanged) |
| 1 | 1 | hidden (lone taker, e.g. the challenge flow) |
| 2+ | 0 | visible: tiles show 2+/in-progress/0, no score rows, no my-score |
| 2+ | 1 | visible: tiles, one score row, my-score for that taker |
| 2+ | 2+ | visible, same as today |

Edge cases:

- The viewer's own visit always counts toward `visitors` (recorded by the stats fetch that the card itself triggers).
- A viewer who started but did not submit is included in both `visitors` and `inProgress`; a viewer who submitted is in `visitors` and `submissions` only.
- A failed stats fetch still renders nothing (best-effort, unchanged).

## Files

- `src/lib/client/TestStatsCard.svelte` — the gate expression and its comment.
- `tests/e2e/test-stats.e2e.js` — assertions for the new visibility points (recorded test change).
- `tests/e2e/design-consistency.e2e.js` — realistic visit seed for its layout audit (recorded test change).

## Testing

**`tests/e2e/test-stats.e2e.js`, test 1** ("visitors, in-progress and submissions across two visitors") already walks the full flow; four points change:

1. Second visitor arrives (2 visitors, 0 submissions): was `toHaveCount(0)`, becomes visible with `visitors = 2`, `inProgress = 0`, `submissions = 0`, no score rows, no my-score.
2. Visitor lands on results after their submission (2 visitors, 1 submission): becomes visible with `submissions = 1`, one score row (`1/2`), my-score `1/2`.
3. Visitor returns to the test summary: becomes visible with `submissions = 1`.
4. First visitor (creator) opens the summary before submitting: becomes visible with `visitors = 2`, `submissions = 1`, one score row, and **no** my-score.

Unchanged in test 1: the lone first visitor stays hidden; after both submit, `2/0/2` with two score rows and my-score `1/2`; the full stats page assertions. **Test 2** (challenge name) keeps its hidden assertion — that taker is the only visitor — with its comment updated to say the card needs a second visitor.

**`tests/e2e/design-consistency.e2e.js`** ("test start, stats and results stay fluid at every width") seeds two submissions without visit rows; under the new gate the layout audit would lose the card. Its seed gains two `ai_test_visits` rows with distinct synthetic identities (`identity_key` only; timestamps default) so the audit visitor sees `visitors >= 2`; the comment is updated. Layout assertions are unchanged. The seeded anonymous attempts stay excluded from the public score list (existing behavior), so the audit still sees an empty score area.

No unit tests: the gate is presentational, and `testStats.test.js` covers pure helpers that do not change.

## Rollout

- No feature flag. The change is presentational and reversible by one line.
- Intent record `CHG-0026` carries the scope and the two recorded test changes.
- Verify with the repo gates (`lint`, `check`, unit, `test:e2e`, `verify:vercel`) and, post-deploy, open a shared test with 2+ visitors on `/test` and `/results`.

## Known limitations

- Visitor counts are identity-based approximations: one person signed out on two devices counts twice; anonymous-to-signed-in identity upgrades can count one person twice until they sign in on one identity only. This matches the existing stats system.
- At exactly two visitors with no submissions the card shows three tiles and no scores; that is the intended minimum, not a defect.
