# Nudge Engine — Design

Date: 2026-09-26
Status: approved (brainstorm; decisions delegated and recorded here)
Scope: one fail-open policy layer that decides when Selftest prompts a learner —
share nudges, push-permission asks, and in-app notifications for new and
relevant exam updates — across new and repeat cohorts. Extends the exam
notification tracker: in-app delivery moves in scope; deadline push reminders
stay backlog. No new user-facing pages, no server-side notification state in v1.

## 1. Decisions

- **Moment router, code owns policy.** Jev answers narrow judgments (one
  Choice plus guardrail Scores/Nouls) in the existing `/api/personalize` call;
  deterministic code owns eligibility, caps, copy, placement, and holdout. The
  model never spends a permission prompt or invents candidates.
- **Cohort by practice days, not test count.** `new` = practice on fewer than
  2 distinct days; `repeat` = 2+. Two tests in one sitting is enthusiasm;
  returning on a second day is habit.
- **Push asks start at the return gate** (`repeat`), because a denied
  permission is effectively permanent. The passive reminder toggle stays
  exactly where it is for everyone else. The ask CTA must be a real user
  gesture; it calls the existing `enableReminders()`.
- **Share nudges start at the first completed result** for both cohorts and
  lead with "challenge a friend" when the result is challenge-worthy (pct ≥ 60
  or personal best), else a plain share. The `ch`/`by` challenge loop is
  already client-side and needs no server change.
- **In-app notifications are "updates for your exams", not a generic activity
  feed.** Content v1: new published exam notifications and `open →
  closing_soon` transitions for exams the learner bookmarked or practiced.
  Hard matches auto-badge; Jev judges soft matches and whether to interrupt.
- **Piggyback on `/api/personalize`.** Home, results, practice, and history
  already call it once per load with offline/data-saver skip, timeout, rate
  limiting, and fail-open. Nudges ride that call; ineligible moments send no
  nudge questions and pay no tokens. A dedicated `/api/nudge` stays a
  mechanical extraction if the coupling ever hurts.
- **Fail-open is silence.** Any error, low confidence, missing key, or
  unknown state → no nudge, never a broken prompt. `NUDGE_ENABLED` must be
  `'true'` for any nudge question to be built; unset is a full kill switch.
- **Local-first state, server-side holdout.** The nudge ledger and seen
  markers live in localStorage (consistent with history/bookmarks); a 10%
  deterministic holdout is computed server-side from the client id so
  incrementality can be measured and cannot be gamed. No schema bump.
- **Ranking stays on Jev, never Gemini.** The sync pipeline owns the Gemini
  flash quota (5 RPM / 20 RPD, paced with a flash-lite fallback); every
  user-triggered judgment goes through TypeSafe as the existing personalize
  routes do.
- **Never salesy.** No fake urgency, no "don't miss out", dismiss is always
  one tap. This app serves students, some minors; the nudge should read like a
  helpful classmate.

## 2. Channels and the shared interruption budget

| Channel | Cost | Jev decides | Code gates |
| --- | --- | --- | --- |
| `NudgeCard` (in-page) | Low, contextual | Which share/push ask fits this moment | Cohort, thresholds, caps |
| In-app notifications (bell + panel) | Free to badge | Soft relevance; whether to interrupt | Candidate tiers, seen ledger |
| Interruption toast | Attention | Which update deserves the interrupt | One interrupt/session, quiet hours |
| Push permission ask | Permission (irreversible) | Whether the moment fits | Return gate, denied → never |

At most one interruptive surface per session. Priority: a deadline-bearing
notification (tier 0 or `closing_soon`) beats a share/push ask; the badge is
passive and not part of the budget. Push permission asks are only ever
triggered by tapping the card CTA — never automatically.

## 3. State and questions

PII-free, counts and signals only, validated and clamped server-side with zod:

```js
{
  page: 'results' | 'home' | 'notifications',
  distinctTestDays, testsThisWeek, currentStreak, daysSinceLastTest,
  lastScore: { pct, total }, bestBeaten,
  shareUsed, shareSheetOpenedThisResult,
  reminderState: 'off' | 'on' | 'denied',
  nudgeHistory: { lastShareDaysAgo, lastPushDaysAgo, dismissals },
  session: { secondsOnPage, interactionCount, hourLocal, isDataSaver },
  locale,
  candidates: [{ id, org, title, category, state, status, daysLeft, match }]
}
```

`candidates` is capped at 6 and only present on `notifications` moments.

Questions (batched in one personalization call, ids namespaced `nudge_*`):

- `nudge_moment` — Choice: `share_result` / `share_streak` /
  `challenge_friend` / `enable_reminders` / `wait` / `nothing`.
  Criteria are filtered before the call: new users never see
  `enable_reminders`; denied or already-subscribed users neither; results
  never offers `share_streak`; home never offers `challenge_friend`.
  `wait` = a later checkpoint fits better; `nothing` = no ask is warranted.
- `nudge_share_pride` — Score 0-2 (`awkward` / `acceptable` / `proud`),
  included only when a share kind is offered.
- `nudge_reminder_fit` — Score 0-2 (`no habit` / `some routine` / `clear
  habit`), included only when `enable_reminders` is offered.
- `nudge_receptivity` — Noul: calm/attentive vs rushed/interrupted. Always
  included.
- `nudge_notify_item` — Choice over candidate ids + `none`: which single
  update, if any, deserves an interrupt right now. Only when candidates exist.
- `nudge_relevance_<id>` — Score 0-2 per soft candidate (≤ 6): `unrelated` /
  `worth seeing` / `directly matches`.

## 4. Deterministic policy

**Eligibility.** Share kinds: ≥ 1 completed test, share sheet not already
opened for this result. `share_streak`: current streak ≥ 3, home only.
`enable_reminders`: repeat cohort, `reminderState === 'off'`, browser supports
push. Notifications: published rows only; tier 0 = `exam_id` in bookmarked or
practiced exam ids; soft = same category/state and Jev relevance ≥ 1.0, repeat
cohort only.

**Thresholds (initial, tuned from telemetry):** moment confidence ≥ 0.5;
share requires pride ≥ 1.0; push requires reminder-fit ≥ 1.5 and receptivity ≥
0.55; interrupts require the same receptivity and a picked item.

**Caps.** One nudge per session; 24h global cooldown; share cooldown 3 days;
push cooldown 7 days; dismiss backoff 14 → 30 → 90 days per kind; denied →
push nudges permanently off; ≥ 5s dwell on results, 2s on home; no toasts
21:00–07:00 local or mid-test; one toast per session and 24h; badge exempt.

**New/relevant.** New = `first_seen_at` or `published_at` within 14 days and
absent from the local seen ledger. Ledger keys are `notificationId + event`
(`new` | `closing_soon`); `last_seen_at`/`updated_at` are deliberately not
used because the daily sync refreshes them (that would re-badge every
morning). Closed rows never notify; quarantined rows never leave the server.

**Holdout.** `hash(clientId) % 100 < 10` → no nudge questions, `nudge: null`,
`metadata.nudgeHoldout = true` on the API event.

## 5. Surfaces

One `NudgeCard.svelte`, inline never modal, 44px targets, no animation under
data-saver, `aria-live="polite"`:

- **Results:** under the hero stats, after the dwell gate. CTA opens the
  existing share sheet (or card flow), with `source: 'nudge'` on the existing
  share events.
- **Home/streak:** beside `StreakCard`. Push CTA calls `enableReminders()`
  directly; a failed or denied result is reported in `nudge:clicked`
  (`outcome: enabled | denied | error`) and denial disables push nudges.

Notification UI: a bell with an unseen-count badge in the header (desktop and
mobile); a dropdown on desktop and a bottom sheet on mobile listing items with
the hub's status pills, dates, official-notice link, and "Practice for this
exam" CTA; an interrupt reuses `showToastWithAction` with a longer duration.
Panel strings in EN + HI; notification content stays as published.

## 6. Wiring

- `src/lib/server/nudges.js` (new, pure): constants, eligibility filter,
  question builders, derivation for moments and notification ranking, the
  holdout hash. Unit-tested from the failure list.
- `src/routes/api/personalize/+server.js`: accepts the validated nudge slice,
  merges questions when `NUDGE_ENABLED === 'true'` and the moment is eligible,
  returns a `nudge` field, logs `metadata.nudgeKind` / `nudgeHoldout`.
- `src/lib/client/nudge.js` (new): state builder, local ledger, pre-filter,
  request/apply decision, marking, interrupt budget.
- `src/lib/client/NudgeCard.svelte` (new); results and home pages wire it.
- `GET /api/exam-notifications` (new, public): promotes the tracker's
  backlogged JSON API. Same read path (`listExamNotifications`), same cache
  recipe (`public, max-age=0, s-maxage=600, stale-while-revalidate=3600`),
  same "DB failure → empty feed, never 500" contract; exposes `firstSeenAt`
  and `publishedAt`; bounded (30 items, 90-day window).
- `src/lib/client/notifications.js` (new): feed fetch with last-payload
  cache, interest matching, seen ledger, badge count, ranking request.
- Header bell + panel components; `src/lib/shared/examNotificationStatus.js`
  is reused for status and `closing_soon` transitions (client-safe, no
  duplicated date logic).
- Locale keys in `english.json` + `hindi.json`; telemetry allowlist entries in
  the same commit as their emit sites.

## 7. Telemetry and success measures

New events: `nudge:shown` `{kind, confidence, cohort}`, `nudge:clicked`
`{kind, outcome?}`, `nudge:dismissed`, `nudge:suppressed` (reason),
`notifications:view`, `notifications:item-open`, `notifications:practice-click`,
`notifications:dismiss`, `notifications:all-read`, `notifications:badge-shown`,
`notification:toast-shown`, `notification:toast-click`,
`notification:toast-dismiss`. Panel link clicks reuse `exams:notice-open` /
`exams:practice-click` with `source: 'notification'`. Ranking logs through the
existing `personalize:*` events with `page: 'notifications'`.

Primary reads: challenge/share actions per completed test and opt-in rate
among repeat-eligible users, treatment vs holdout, split by cohort. Guardrails:
dismiss rate, reminders disabled within 7 days, permission deny rate, results
bounce. `npm run telemetry:report` renders the funnel.

## 8. Testing

- **Unit first, failure lists first** (repo rule): `nudges.test.js` —
  ineligible kinds filtered, threshold misses, `wait`/`nothing`, malformed and
  out-of-range state, holdout determinism, candidate caps, quarantine/closed
  never ranked, stale `last_seen_at` never re-badges. `nudge.test.js` for the
  client ledger (cooldowns, backoff escalation, interrupt budget, denied →
  off). `notifications.test.js` for matching and seen keys.
- **E2E** `tests/e2e/nudges.e2e.js`: stub `/api/personalize` with
  `page.route` (no key in CI; the real route fails open), seed history in
  localStorage, assert show → click routes to the existing share flow →
  dismiss writes backoff → suppressed on reload; push variant asserts the CTA
  reaches the reminder flow (the real permission path stays in the opt-in
  `test:e2e:push` suite).
- **E2E** `tests/e2e/notifications.e2e.js`: seed `exam_notification` rows
  through the `/api/test/db` bridge reusing `tests/e2e/testDb.js` helpers;
  assert badge count, panel rendering, official links, practice CTA, dismiss,
  seen-ledger suppression, `closing_soon` re-badge once, EN/HI chrome.
- **Artifact** stays byte-identical on a clean tree; run `lint`, `check`,
  `test`, `test:e2e`, and `verify:vercel` (new route + i18n + telemetry).

## 9. Rollout

`NUDGE_ENABLED` starts unset. Phase order: (1) pure module + route field +
client ledger behind the flag; (2) results share nudge; (3) home share +
push-ask nudge; (4) feed API + bell/panel with tier-0 badges; (5) Jev soft
relevance + interrupts; (6) tune thresholds and consider loosening the return
gate from telemetry. Any phase can ship dark; the flag is the kill switch.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Permission burn on too-early asks | Return gate; denied → never; CTA gesture only |
| Nagging / trust erosion | One interrupt per session, dismiss backoff, quiet hours, code-owned copy |
| Stale or duplicate badges | `first_seen_at`-keyed ledger with per-event keys; quarantine never leaves the server |
| Model over-eagerness | Confidence-gated routing; guardrail scores; deterministic caps |
| Coupling to personalize route | Pure `nudges.js` module; extraction to `/api/nudge` is mechanical |
| i18n drift | Every string ships in EN + HI in the same commit; e2e asserts Hindi chrome |
| Holdout untrustworthy | Server-side hash from client id; logged on the API event |

## Out of scope

Push content sends (the daily sender and server-side interests stay backlog),
server-side seen-state sync for signed-in users, per-notification pages,
admin quarantine view, PWA install nudge, classroom/leaderboard growth loops.
