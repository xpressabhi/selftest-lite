# Implementation Plan: Jev Hybrid Personalization

## Overview
Add one Jev-powered `/api/personalize` router (central page decisions + debounced in-test micro + onboarding infer) that only hides/collapses/promotes existing UI. Fail-open to today's static UI. Follows `parse-intent` patterns: pure derive in `lib/server`, thin `+server.js` I/O, Tier-0 local first, confidence gates.

## Architecture Decisions
- Pure `src/lib/server/personalize.js` (`buildPersonalizeQuestions`, `derivePersonalize`) mirroring `intentParse.js`; `src/routes/api/personalize/+server.js` owns auth/rate-limit/telemetry/Jev call.
- Telemetry keys added in same commit (`personalize:request`, `personalize:applied`, `personalize:fallback`).
- UI applies results as progressive enhancement only; every hide keeps a View-all path.
- Timeouts 4-5s, throttles (page-load once, in-test min 8s gap max 3/test), data-saver/offline skips Jev.

## Task List
### Phase 1: Foundation
- [ ] Task 1: pure personalize engine + unit tests
- [ ] Task 2: `/api/personalize` route + telemetry allowlist
### Checkpoint: Foundation
- [ ] `npm run test`, `npm run lint` pass; route fail-open verified
### Phase 2: Central routers UI
- [ ] Task 3: home primary-action + history rerank wiring
- [ ] Task 4: results focus + practice promote wiring
### Checkpoint: Central
- [ ] Clutter check on mobile 360px + slow-3G; telemetry applied/fallback firing
### Phase 3: Micro
- [ ] Task 5: in-test stuck/fatigue trigger (debounced)
- [ ] Task 6: onboarding infer via parse-intent extension
### Checkpoint: Complete
- [ ] `npm run test`, `npm run lint`, `npm run check` pass; EN+HI strings if any new copy

## Risks and Mitigations
| Risk | Impact | Mitigation |
| Jev latency on low-end | Med | Tier-0 first, 4s timeout, fail-open, skip on data-saver |
| Wrong hide annoys users | High | conf<0.5 fallback; always keep View-all |
| Telemetry test fails | Med | allowlist + emit site in same commit |
| Scope creep into prompts | Med | no Gemini prompt changes in this plan |

## Open Questions
- Tune `0.5/0.8` thresholds after 1 week of `personalize:applied` logs? Default yes.
- Tasks tracked in `tasks/todo.md` (default, no external tracker).
