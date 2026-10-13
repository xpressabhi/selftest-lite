## scope.included

- generate/+server.js: full-exam pattern resolution discovers on a cache miss (B).
- generate/+server.js: a reused exam paper with no marking scheme is rejected when a pattern is available (C).
- examPatternWarmup.js + 17 unit tests: pure planning for the warm-up.
- scripts/warm-exam-patterns.mjs: demand-driven pattern warm-up against the existing endpoint.
- .github/workflows/exam-patterns.yml + npm run exams:patterns: the daily warm-up (A).

## scope.excluded

- Backfilling sections onto the 23 existing papers; the reuse rejection makes it unnecessary.
- Marking the 23 historical attempts, which have no recorded scheme.
- Removing the condition from C, which would regenerate sectionless papers forever.
- Any change to computeAttemptMarks, the attempt schema, the discovery prompt or the UI.

## preserved

- A cached pattern still costs no model call; discover only matters on a miss.
- Quiz-practice papers keep marks null and the marks row stays hidden.
- Reuse is otherwise unchanged: a paper is rejected only when a pattern can supply the scheme.
- getExamPattern, refreshPattern, assignSectionsToPaper and computeAttemptMarks are untouched.

## decisions

- The warm-up drives the app's existing /api/exam/pattern over HTTP because examPattern.js imports $env/dynamic/private and cannot load in a bare node script; this keeps the discovery prompt in one place.
- patternKeyForExamId restates the key format and a unit test asserts equality with the real patternKeyFor, so drift fails the suite rather than silently re-warming cached patterns.
- Warming is demand-driven (exam ids from ai_test) with --all and --limit as explicit opt-ins, and fresh patterns are skipped before any HTTP call.
- The reuse rejection is conditioned on examPattern being available; unconditional rejection would regenerate a sectionless paper on every request.
- Real run against production: 13 exams discovered, 1 fresh, 0 failed, so all 14 demanded exams now have a cached pattern.

