# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

Full-exam papers now acquire the marking scheme that makes marks computable. Change `CHG-0008`
revision 1, proposal digest
`sha256:198db185504a35b0ceb169db35c3fa7da4c52c6e60da7dff1e1db1c37ac4a46e`.

Three pieces, because the root cause had two independent links:

- **B** — `generate/+server.js`: full-exam pattern resolution now passes `discover: true`, so a cache
  miss discovers instead of shipping a paper with `sections: []` (which is what made
  `computeAttemptMarks` return null and left marks unset).
- **A** — `examPatternWarmup.js` + `examPatternWarmup.test.js` + `scripts/warm-exam-patterns.mjs` +
  `.github/workflows/exam-patterns.yml` + `npm run exams:patterns`: a demand-driven daily warm-up that
  keeps the pattern cache populated, so B's discovery is normally a cache hit.
- **C** — `generate/+server.js`: a reused full-exam paper with no marking scheme is rejected the same
  way a structurally defective one already is, but only when a pattern is available to supply the
  scheme.

## Verification

| Command | Result |
| ------- | ------ |
| `npm run lint` | pass, no output |
| `npm run test` | **940 passed / 76 files** (was 923 / 75; +17 in `examPatternWarmup.test.js`) |
| `npm run check` | pass — `check-build-mode: OK — 193 chunks, no DEV-only code, service worker registration present` |
| `npm run test:e2e` | **176 passed**, no retries, suite unmodified |
| `npm run exams:patterns -- --url=… --dry-run` | planned 14 targets (1 fresh, 13 to warm) with zero HTTP and zero model calls |
| `npm run exams:patterns -- --url=https://www.selftest.in` | **13 discovered, 1 already fresh, 0 failed** |

The real warm-up left all 14 demanded exams with a cached pattern (12-200 questions each, e.g.
`ssc-cgl`: 4 sections, 2 marks per question, −0.5 negative). Because the deployed code already uses
cached patterns, this alone changes production behaviour, and the patterns were verified in the
database afterwards.

### Not yet verified, and why

The end-to-end claim — "a freshly generated full-exam paper carries `sections`, and a submission
stores `marks > 0`" — needs B and C deployed. The post-warm-up probe of the live app made this
explicit: a full-exam request for `ssc-cgl` returned the existing shared paper (id 1204) in 409 ms
with `sections: []`, and its attempt stored `marks 0/0`. That is C's case working as intended *before*
the guard exists, and it is why C is in scope.

Expected after deploy, for `ssc-cgl` (2 marks per correct, −0.5 per wrong): the shared sectionless
paper is rejected, a fresh paper is generated with sections, and a submission on it stores
`marks = 2·correct − 0.5·wrong` with `total_marks = 2·questions`.

### Production side effects (disclosed, not cleaned up)

- Papers **1876** ("Agent probe: units and measurement basics", 5 questions) and an attempt
  (client `agentprobe-0001`, 3/5) from the earlier stats probe.
- An attempt on the real shared paper **1204** (`ssc-cgl`, 20 questions) from this verification:
  client `agentprobe-0004`, name "Marks probe", score 10/20, `marks 0/0`. It is visible on that
  paper's public stats page. `AGENTS.md` forbids deleting without the archive-first path, so it was
  left in place; the archive-first removal is available if it should not be public.
- 13 discovered pattern rows in `exam_patterns` (the intended output of A).

## Test changes

None. No pre-existing test was modified, skipped or deleted. `examPatternWarmup.test.js` is an
addition (17 tests) and was written before its module, per the repository's rule for testing a system
in isolation.

## Deviations and decisions

- **C was not in the requested scope.** The instruction was "B + A". Verifying A surfaced that
  full-exam papers are *shared* (`findReusableFullExamRecord` returns the newest paper per
  exam+language), so one sectionless paper is served to many users — 23 papers cover 14 exam_ids
  precisely because they are reused. Without C, B would only help exams that had never produced a
  paper, and every existing shared paper would stay unmarked indefinitely. C is five lines in an
  existing guard, so it was included rather than deferred.
- **The warm-up calls HTTP instead of the database.** `examPattern.js` statically imports
  `$env/dynamic/private`, so a bare `node` script cannot load it — the same constraint that shaped
  `CHG-0007`'s analysis. Rather than duplicate the discovery prompt or move it out of the app, the
  script drives the endpoint that already exists. The cost is a duplicated key format, which the unit
  tests pin against the original.
- **A backfill was considered and rejected.** It would need `assignSectionsToPaper` moved out of the
  `$env`-importing module and a write to 23 production rows, to reach the state C reaches by itself on
  the next request per exam.
- **Historical attempts stay unmarked.** No scheme was recorded when they were graded, and today's
  pattern may not be the one that applied; 23 attempts are not worth a speculative rewrite.

## Follow-ups

- Deploy and verify: regenerate a full-exam paper and confirm `sections` on the stored paper and
  `marks > 0` on the attempt.
- `CHG-0007` follow-ups still stand: `logApiEvent` on the critical path, the `json → jsonb` migration
  on `ai_test` (measured ~2.9× on the list query), and the UTC-day bucketing in the stats `daily[]`.
- Optional: `--all` warm-up once, to pre-cache patterns for the remaining 87 registered exams, so
  their first generation also skips discovery latency.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`.
