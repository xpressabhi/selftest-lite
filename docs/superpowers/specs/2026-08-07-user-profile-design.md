# User Profile & Adaptive Personalization — Design

Date: 2026-08-07
Status: Approved (awaiting spec review)

## Goal

Make selftest.in feel like it *knows* the learner. Store what each user studies (class, exam target, subjects, preferences, focus areas), keep it fresh from behavior, and use it while intent parsing and paper creation — so test papers are tailored to the user and difficulty escalates as they improve. This is a differentiating feature vs. platforms that treat every user identically.

## Decisions (from ideation)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Profile build | Hybrid: 3–4 question setup wizard + behavior inference |
| 2 | Difficulty ramp | Both: within-test gradient + across-tests adaptive ladder |
| 3 | Scope | Logged-in full, anon lightweight (carries over on sign-in) |
| 4 | Focus topics | Merged: declared focus + inferred weak topics |
| 5 | Assertiveness | Auto-prefill with visible override (explicit user choices win) |
| 6 | UI | `/profile` page + compact "tailored to you" chip on home |
| 7 | Intent parsing | Profile into parse-intent + fallback defaults in generation |
| 8 | Privacy | Opt-out + transparency ("what we know") + one-tap delete |

## Architecture

Profile stored as one allowlisted JSON key in the existing `app_user_state` table (per-identity key/value JSONB, syncs through `/api/user/state`, rebinds anon→user on login via `backfillUserIdentity`). Inferred weak/strong topics are **not stored** — computed server-side per request by joining `ai_test_attempts` → `ai_test` (answer keys live in the DB, so per-question correctness is derivable).

Chosen over a dedicated `user_profile` table (no anon support, duplicates sync/rebind) and columns on `app_user` (breaks anon, fixed columns vs. nested profile).

## Section 1 — Data model

`selftest_user_profile` key in `app_user_state`, added to `SYNCED_STATE_KEYS` allowlist in `src/lib/shared/userState.js`:

```json
{
  "version": 1,
  "setupComplete": false,
  "class": "class-10",
  "examTarget": { "examId": "jee-main", "name": "JEE Main" },
  "subjects": ["Physics", "Maths"],
  "preferences": {
    "language": "hindi",
    "difficultyComfort": "intermediate",
    "personalized": true
  },
  "declaredFocus": ["trigonometry", "thermodynamics"],
  "updatedAt": "2026-08-07T..."
}
```

- `class`: optional, from wizard (e.g. `class-8` … `class-12`, `college`, `other`).
- `examTarget`: optional, linked to the existing exam catalog (`examId`/`name`).
- `preferences.personalized`: opt-out toggle; when `false`, profile context is skipped and the wizard stops prompting.
- Same shape for anon users (keyed by `client_id`); rebinds to the account on sign-in.
- `updatedAt` set on every write; client merges conflicts (last-write-wins with field-level merge, mirroring existing state merge pattern).

## Section 2 — Adaptive engine (server, pure functions)

New `src/lib/server/profile.js`:

- `computeLearnerSignals({ userId, clientId })` → `{ weakTopics: [{ topic, accuracy, attempts }], strongTopics: [], overallAccuracy, testsTaken, lastDifficulty, preferredLanguage }`
  - Join attempts + test records; per-topic accuracy from graded `user_answers` vs. answer key.
  - Min-attempts threshold (≥2 attempts per topic) before a topic is treated as weak/strong.
  - Recency-weighted accuracy (recent attempts count more).
- `resolveDifficulty(profile, signals, request)` — adaptive ladder. "Current level" for a topic = the difficulty of the user's most recent attempt on that topic; for topics never attempted, seed from `preferences.difficultyComfort` (default `beginner`):
  - ≥85% recent accuracy on a topic → escalate one level for next test on it.
  - 60–85% → stay at current level.
  - <60% → drop one level.
  - Bounded by `preferences.difficultyComfort` and test-type limits; explicit user-chosen difficulty in the request always wins.
- `mergeFocusTopics(declared, weak)` — union, capped at top 5 (declared first, then inferred weak by severity).
- `buildProfileContext(profile, signals, request)` — the exact text block injected into the prompt ("USER CONTEXT: class 10, preparing for JEE Main; focus: trigonometry; weak: thermodynamics (38% acc, 3 attempts); difficulty: intermediate"). PII-free — no name/email.

Ladder thresholds and caps are constants in `src/lib/server/quizConfig.js`, tuned later.

Anon users get only lightweight context (preferred language + last difficulty), no weak-topic inference (per decision 3).

## Section 3 — Prompt & intent integration

- `generatePrompt()` in `src/lib/server/prompt.js` gains a `userContext` param threaded through `generatePaper` → `generateQuestionBatch` → `generatePrompt`. New "USER CONTEXT" section with rules:
  - Warm-up: first ~20% of questions at one level below target.
  - Remainder at the resolved target level.
  - Emphasize focus topics; include practice questions on weak topics.
- `POST /api/parse-intent`: inject a "STUDENT CONTEXT" line into its prompt (class, exam target, subjects, language) — no output schema change; used only to disambiguate (e.g. "physics test" → class-10 vs JEE physics).
- `POST /api/generate`: after validation, compute signals, resolve difficulty (profile default only when the user left difficulty unspecified), build context, inject. Response gains `personalized: boolean` and `tailoredSummary` (e.g. "Adjusted for: JEE Main • focus: trigonometry") for the UI chip.
- Explicit user choices in the request always override profile defaults (decision 5).

## Section 4 — UI

- **Wizard**: modal on home when `setupComplete === false` for logged-in users. 3–4 steps: (1) class / exam target (reuses existing exam catalog), (2) subjects, (3) language + difficulty comfort, (4) optional focus topics. Dismissible. Persists via existing state sync.
- **`/profile` page**: edit all wizard fields + focus topic manager + "what we know about you" (inferred weak/strong topics, read-only, from `GET /api/user/profile/insights`) + personalization toggle + reset profile button.
- **Home chip**: below the generate area when personalized: "Tailored to you: {summary}" + link to `/profile`.
- All UI strings in `src/lib/locales/english.json` + `hindi.json` (mandatory i18n).

## Section 5 — Privacy & endpoints

New rate-limited endpoints, identity-scoped (session cookie or `x-client-id`):

- `GET /api/user/profile` — read profile (or null).
- `POST /api/user/profile` — save (validated against the schema above).
- `GET /api/user/profile/insights` — computed learner signals (read-only display).
- `DELETE /api/user/profile` — reset profile (history untouched).

Behavior when `preferences.personalized === false`: generate/parse-intent skip profile context; wizard no longer prompts. New telemetry events (`profile:save`, `profile:reset`, `profile:opt-out`) via the existing allowlist. No new tracking surface.

## Section 6 — Scope & rollout order

1. Server: profile storage (allowlist key) + endpoints + validation + tests (pure logic first).
2. Adaptive engine: signals, ladder, focus merge + unit tests.
3. Prompt / parse-intent / generate integration + response fields.
4. Wizard + home chip + `/profile` page (EN + HN).
5. Anon lightweight + rebind polish, telemetry events, README/docs update.

## Testing

- Unit tests for pure logic in `src/lib/server/profile.js` (signals computation, ladder thresholds, focus merge, context building) — no network/DB in tested functions where possible.
- Endpoint tests follow existing patterns (rate limiting, identity scoping).
- Verify: opt-out path skips all profile injection; explicit user difficulty beats profile; anon profile carries over after sign-in.
