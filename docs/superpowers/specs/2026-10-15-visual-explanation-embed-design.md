# Visual explanations in place: inline embed, question linking, and the Jev fit gate (Design)

Date: 2026-10-15
Status: approved (inline generate + embed; server-recorded question↔explainer links; one merged
explain flow per review question; one shared Jev "visual-fit" judge enforcing the gate on both the
review card and the playground Generate action)
Scope: results review cards gain a visual-explainer section that generates and embeds the animated
artifact inline, without leaving the page; explainers generated from a question are linked back to
that question and restored on later visits and other signed-in devices; the playground gains a Jev
pre-generation gate that refuses vague or text-first topics with guidance instead of spending
tokens; `/playground` and `/explain/[slug]` keep their distinct roles but cross-link. No change to
`/api/explain`, the markdown pipeline, the artifact sandbox/CSP, or the public explainer page's
identity-free contract.

## 1. Objective

Three defects and one design question motivate this change:

1. **The visual explainer is disconnected from the question it came from.** `ResultReviewItem`'s
   "Explain visually" link (`buildPlaygroundHref`) opens `/playground` prefilled, but generation
   happens there and nothing links back: the review card never shows that an explainer exists for
   its question, and the library never says which test/question produced an explainer.
2. **The visual explainer cannot be seen in place.** It renders only on the playground and the
   public page; users must navigate away and return manually.
3. **Every playground Generate spends model tokens even when a visual makes no sense** (definitions,
   dates, textual facts). The playlist's cost philosophy (D6/D7 of the playground design) wants a
   judgment step before generation, not after.

The user's intent, in their words: tapping "Explain visually" should generate and embed the visual
"just below the question so that user don't need to navigate to any other page"; whatever generates
"should get linked back to the actual question in the test result page where from where the button
was clicked"; the playground should judge with Jev first and "if it is not required… don't show the
button", and on a not-worth-it topic "inform user… unless they provide more details" rather than
generate anyway.

Success criteria:

- From a review card, one tap on "Build visual explanation" produces the animated artifact **inside
  the card**; no navigation, no new route. Re-opening the test later (any signed-in device) shows
  the affordance immediately and the artifact loads from cache with no model call.
- A generated explainer is recorded against the question (identity-scoped), and the same test's
  results page restores every visual explanation it has.
- The review card's visual affordance appears only when Jev judges the question visually worthwhile
  (or a link already exists); the playground refuses vague/text-first topics with guidance and
  spends zero generation tokens on them; both gates fail open on judge outage.
- Public sharing, the artifact sandbox contract (`sandbox="allow-scripts"`, `default-src 'none'`
  CSP), and `/api/explain` are unchanged.

## 2. Non-goals

- **HTML in explanations.** The markdown pipeline (`MarkdownContent.svelte`, `markdownRenderer.js`,
  `rehype-sanitize`) is untouched; the visual artifact only ever runs inside `ArtifactFrame`.
- **Merging the playground and the public page into one route.** They keep different jobs (§3 D8).
- **A "generate anyway" override.** A rejected topic is answered with guidance to refine; repeat
  attempts on unchanged text are instant (verdict cached). Revisited only with telemetry evidence.
- **Auto-generated visuals for every wrong answer.** The auto-explain-wrong setting stays text-only.
- **Visual regeneration / variants** beyond the existing error retry.
- **Cross-user link sharing.** Links are identity-scoped pointers into the shared explainer cache;
  sharing remains the public `/explain/<slug>` URL's job.
- **Pre-login cross-device links.** Links created anonymously live with the client identity, exactly
  like the existing explainer library (no backfill change).
- **A new read path for explainer HTML.** The embed opens through the existing
  `GET /api/playground/library?id=`.

## 3. Decisions

**D1 — One merged explain flow per review question.** The card keeps one explanation region: the
markdown explanation (unchanged pipeline, tap-to-generate or already present) and, directly below
it, the visual section. The visual builds on its own second tap ("Build visual explanation"),
keeping cost explicit and generation rate limits (5/min) safe. Rejected: auto-starting the visual
with every text-explain tap (every explain would cost 3 model calls; a 10-wrong auto-explain run
would be a token bomb).

**D2 — Generate inline; embed in a card-scoped section.** Tapping "Build visual explanation" POSTs
the existing `/api/playground` with the question context and renders the returned artifact with the
existing `ArtifactFrame` inside the card. Rejected: keeping the navigation flow and linking back
afterwards (the user's explicit ask is no navigation).

**D3 — One shared Jev judge, two enforcement points.** A single server module judges
"would an animated visual explanation meaningfully help understand this?", used by (a) the review
card's affordability check and (b) `/api/playground` before a cache-miss generation. Verdict
categories: `worth_it`, `too_vague`, `not_visual`. Suggestion requires `worth_it` at
≥ `VISUAL_FIT_MIN_PROBABILITY` (0.6). Model `jev-latest` via `TypeSafeClient` (5 s timeout, no
retries), matching `/api/personalize`. Rejected: two separate heuristics (drift); client-side
judgment (unenforceable — the playground endpoint would remain a token sink).

**D4 — The verdict is content-addressed and global; degraded verdicts are not cached.** The verdict
key covers normalized topic + question + answer + language + judge version, so one Jev call serves
every user forever for the same content, and repeats are deterministic. A judge failure is
fail-open (`suggested: true, degraded: true`) and is **never persisted** — the next request
re-judges. Cache hits (an existing explainer) skip the judge entirely.

**D5 — The playground's refusal is a guidance state, not an error, and does not consume generation
quota.** Request order on a cache miss: explainer cache → judge → refusal (200
`VISUAL_NOT_WORTHY`, no generation) → generation rate limiter → generate. The client renders a
panel explaining what detail would help; the topic text stays editable; no override button in v1.

**D6 — Question↔explainer links are recorded server-side, identity-scoped.** New table
`question_explainer_links` keyed by identity + `test_id` + `question_index`, pointing at the
explainer `cache_key`. Written when `/api/playground` serves an explainer for a request that
carried `source: { testId, questionIndex }` (both cache hits and fresh generations). Read pattern
mirrors `user_explainers` (`user_id = X OR (user_id IS NULL AND client_id = Y)`) — same-device
upgrade after login keeps working; no `backfillUserIdentity` change.

**D7 — Whole-test awareness via one cheap read; the embed reuses the library endpoint.** On the
results page, one `GET /api/playground/links?testId=…` (owner-only, `no-store`) returns the linked
per-question entries. Cards then either show "Show visual explanation" (instant cache read via
`/api/playground/library?id=`) or fall through to the verdict-gated "Build" affordance. A links
read failure degrades silently to today's behavior (build available where the verdict allows).

**D8 — Two surfaces, two jobs, cross-linked.** `/playground` is the private workspace (create,
library, search, share); `/explain/[slug]` is the public view-only permalink (share targets, SEO,
identity-free). They already share `ExplainerHeader`/`ArtifactFrame`. Seamlessness comes from:
inline embed on the review card (primary consumption), "Open full page" on the embed, "Create your
own" CTA on the public page, and provenance chips ("From your test") on playground library items
that deep-link back to `/results?id=…#question-N`. Merging the routes would either expose the
private library to shared-link visitors or drop public sharing.

**D9 — The review card's old "Explain visually" link is removed**; its telemetry event
(`playground:entry-from-review`) and the now-unused `buildPlaygroundHref` helper (plus its unit
test) are removed with it. The `/playground?topic=…&question=…&answer=…` prefill contract itself
stays (still read by the playground; covered by existing E2E).

**D10 — No feature flag.** Exposure is user-initiated, cache-first, and rate-limited; the one
behavior change (playground refusal) is measured via judge-outcome telemetry before any tuning.

## 4. API contracts

### 4.1 `POST /api/visual-fit` (new)

Request:

```json
{ "topic": "optional", "question": "required", "answer": "required", "language": "english" }
```

- Length caps: `MAX_TOPIC_LENGTH`, `MAX_QUESTION_TEXT_LENGTH`, `MAX_ANSWER_TEXT_LENGTH`; `language`
  ∈ `VALID_LANGUAGES`, default `english`. Errors `400 VISUAL_FIT_FIELDS_REQUIRED`,
  `400 VISUAL_FIT_FIELDS_TOO_LONG`, `400 INVALID_LANGUAGE`, `413 REQUEST_TOO_LARGE`.
- Rate limit: own bucket `/api/visual-fit`, 20/min per client; over-quota `429` +
  `API_LIMIT_ERROR_CODE` (clients treat any failure as degraded → affordance shown).

Response `200`:

```json
{ "suggested": true, "category": "worth_it", "confidence": 0.83, "cached": false, "degraded": false }
```

- `category` ∈ `worth_it | too_vague | not_visual`. Provider failure/timeout: `200`
  `{ "suggested": true, "category": "unknown", "confidence": null, "cached": false, "degraded": true }`.
- Server log: `logApiEvent({ route: '/api/visual-fit', action: 'judge_visual_fit', metadata:
  { category, confidence, cached, degraded, model } })`.

### 4.2 `POST /api/playground` (modified)

Request gains optional `source: { "testId": "abc123", "questionIndex": 4 }` (`testId` ≤ 128 chars,
`questionIndex` integer 0–999; invalid shapes are ignored, not fatal).

Order on request: existing field validation → cache read → **judge (cache miss only)** → on
refusal return `200 { "code": "VISUAL_NOT_WORTHY", "category": "too_vague" | "not_visual" }` (no
`title`/`html`; no rate-limit quota consumed) → rate limiter → generate.

When an explainer is served (cache hit or fresh) and a valid `source` was present, the server
records the question link (§4.3) best-effort — a link write must never fail the response, exactly
like the library write today. Response bodies for served explainers are unchanged (including the
existing `slug`).

Generation-failure telemetry gains judge metadata in `metadata`:
`judgeCategory`, `judgeCached`, `judgeDegraded`; refusals log `metadata.notWorthy: true`.

### 4.3 `GET /api/playground/links?testId=…` (new)

- Owner-only, `Cache-Control: no-store`, rate limit 30/min, `testId` required (≤ 128 chars;
  `400 LINKS_TESTID_REQUIRED`). No ownership check of the test row itself — rows returned are
  always the caller's own links, so nothing leaks.
- Response `200`:

```json
{
  "items": [
    { "questionIndex": 4, "libraryId": 12, "slug": "newtons-third-law-x7k2", "title": "…", "createdAt": "2026-10-15T…" }
  ]
}
```

- `libraryId` is the caller's `user_explainers.id`; the join drops rows whose library entry is
  missing (defensive only — both records are written together).
- Server log: `logApiEvent({ route: '/api/playground/links', action: 'read_links', metadata:
  { count } })`.

### 4.4 `GET /api/playground/library` (modified, additive)

List items gain `source: { "testId": "…", "questionIndex": 4 } | null` — the most recent link for
that `cache_key` for this identity — powering the library's "From your test" chip. No other change.

## 5. The Jev judge

**Pure engine** `src/lib/server/visualFit.js` (no I/O, unit-testable like `intentParse.js`):

- `VISUAL_FIT_KEY_VERSION` (`'vf-v1'`, bumped when criteria/instructions change),
  `VISUAL_FIT_MIN_PROBABILITY = 0.6`, `VISUAL_FIT_MODEL = 'jev-latest'`.
- `buildVisualFitQuestion({ question, answer, topic })` → one Choice question id `visual_fit` with
  criteria: `worth_it` ("the answer turns on a process, mechanism, spatial arrangement, motion,
  change over time, or a quantity/geometry relationship — an animation would teach it faster than
  prose"), `too_vague` ("the question/context is too thin or generic to visualize anything
  specific"), `not_visual` ("conceptual, definitional, factual, verbal, or list-like — text is the
  right medium"). Final wording tuned during implementation.
- `deriveVisualFit(jevAnswers)` → `{ category, confidence, suggested }`: `suggested` is true only
  when `worth_it` is chosen with probability ≥ threshold; `too_vague` wins ties between
  non-`worth_it` categories by probability.

**Orchestrator + cache** `src/lib/server/visualFitCache.js` (mirrors `explanationCache.js`):

- Key: `sha256(JSON.stringify([ VISUAL_FIT_KEY_VERSION, language, normalize(topic ?? ''),
  normalize(question), normalize(answer) ]))` (NFC/trim/whitespace-collapse, case preserved).
- `getCachedVisualFit(cacheKey)` / `saveVisualFit({ cacheKey, language, category, confidence,
  model })` (`ON CONFLICT DO NOTHING`) / `touchVisualFit(cacheKey)` (`use_count`, `last_used_at`).

**Judge glue** `src/lib/server/visualFitJudge.js`:

- `judgeVisualFit({ topic, question, answer, language })` → cache read → miss: `TypeSafeClient`
  call (5 s timeout, `retry: { maxRetries: 0 }`) → derive → **persist only non-degraded verdicts**
  → return `{ suggested, category, confidence, cached, degraded }`.
- Any provider/timeout/parse failure → `{ suggested: true, category: 'unknown', confidence: null,
  cached: false, degraded: true }` (D4). Used by both `/api/visual-fit` and `/api/playground`.

## 6. Storage

`question_visual_fits` (in `ensureStorageSchema`, `CREATE TABLE IF NOT EXISTS`):

```sql
id BIGSERIAL PRIMARY KEY,
cache_key TEXT NOT NULL UNIQUE,
language TEXT NOT NULL DEFAULT 'english',
category TEXT NOT NULL,            -- worth_it | too_vague | not_visual
confidence REAL,
model TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
last_used_at TIMESTAMPTZ DEFAULT NOW(),
use_count INTEGER DEFAULT 0
```

`question_explainer_links` (same file):

```sql
id BIGSERIAL PRIMARY KEY,
user_id BIGINT,                    -- nullable, mirrors user_explainers
client_id TEXT,
test_id TEXT NOT NULL,
question_index INTEGER NOT NULL,
question_key TEXT NOT NULL,        -- informational: normalize(question) || '::' || normalize(answer)
cache_key TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
```

- Partial unique indexes: `(user_id, test_id, question_index) WHERE user_id IS NOT NULL` and
  `(client_id, test_id, question_index) WHERE user_id IS NULL`; lookup indexes
  `(user_id, test_id)` / `(client_id, test_id)`.
- `questionExplainerLinks.js` exports `recordQuestionExplainerLink(identity, { testId,
  questionIndex, questionKey, cacheKey })` (upsert: `ON CONFLICT … DO UPDATE SET cache_key,
  question_key, updated_at = NOW()`) and `listQuestionExplainerLinks(identity, testId)` (join
  `user_explainers` for `libraryId`; newest first).
- Archive-first: rows are never deleted, matching `concept_explainers`/`user_explainers`.

## 7. Client

### 7.1 Review card (`ResultReviewItem.svelte` + new `VisualExplainerSection.svelte`)

The new section replaces the old "Explain visually" link. Its state machine (per question):

| State | UI |
| --- | --- |
| `checking` | nothing (verdict request in flight; no button flash) |
| `offer` | "Build visual explanation" (verdict `worth_it`, no link) |
| `available` | "Show visual explanation" (link exists — verdict ignored) |
| `hidden` | nothing (verdict `too_vague`/`not_visual`, no link) |
| `building` | in-card stages (reuse playground planning/drawing copy); card stays scrollable |
| `ready` | title + summary + `ArtifactFrame` + [Share] [Open full page] |
| `error` | localized inline error + Retry (covers 429, `ARTIFACT_INVALID`, network) |

- Verdict fetched once per question per session when the card is expanded and no link exists; any
  fetch failure → `offer` (fail-open). Verdict held in memory; the server cache makes it cheap.
- The verdict request and the build request send the same context fields — paper topic,
  `questionTextFor(question)`, answer, paper language — so the verdict key and the explainer key
  describe the same content.
- Build: `POST /api/playground` with those fields plus current theme, device profile, and
  `source: { testId, questionIndex }`.
- The embed is `no-print`; collapsing the card unmounts the iframe but retains the composed HTML
  string for instant remount; theme is captured per open (same as the playground).
- Results page (`src/routes/results/+page.svelte`): one `GET /api/playground/links?testId=` after
  the paper resolves (failure → empty map, silent); maps flow down through `ResultReviewList`.
  `location.hash = #question-N` expands and scrolls to that question on load (makes library
  provenance deep links land correctly).

### 7.2 Playground (`PlaygroundPage.svelte`)

- Stages become **Judging → Planning → Drawing** (timer-driven copy flips; a cache hit returns
  before the first flip, so repeats look instant).
- Refusal renders a guidance panel (not the error alert): title + category-specific hint
  (`too_vague` → name what you want to see; `not_visual` → describe the process/mechanism you have
  in mind), topic stays editable, example chips remain, no override button. Emits
  `playground:judge-declined`.
- Library list items show a "From your test" chip when `source` is present → `/results?id=<testId>`
  (hash `#question-<index>`).

### 7.3 Public page (`PublicExplainerPage.svelte`)

- Adds a "Create your own" CTA → localized `/playground`. Nothing else changes (identity-free,
  view-only, share unchanged).

### 7.4 Locale keys (starter set; final wording during implementation, both files)

`visualExplainHeading`, `visualBuild`, `visualShow`, `visualOpenPage`, `visualBuildError`,
`playgroundJudging`, `visualFitNotWorthyTitle`, `visualFitVagueHint`, `visualFitTextFirstHint`,
`playgroundFromYourTest`, `explainCreateOwn`. Reused: `playgroundShare`, `tryAgain`,
`playgroundPlanning`, `playgroundDrawing`.

## 8. Security and performance

- The sandbox contract is untouched: `ArtifactFrame` remains `sandbox="allow-scripts"` +
  `srcdoc` + `referrerpolicy="no-referrer"`; the composed document keeps its CSP; nothing
  model-generated enters the app DOM.
- New endpoints are rate-limited, `no-store` where identity-scoped, validate all inputs, and log
  via `logApiEvent`. The judge receives only question content already sent to `/api/explain` and
  `/api/playground` — no new data class.
- Iframes mount only when a card's visual section is revealed; collapsing unmounts. A 20-question
  paper never bulk-renders artifacts. The verdict/links/generation costs per view are bounded:
  links = one read; verdict = one cached judge per distinct question ever; build = one 5/min
  generation.
- Print stays text-only.

## 9. Telemetry

Client events (allowlist in `src/lib/shared/telemetryEvents.js`, emit sites in the same change —
the scan fails on either side of a mismatch):

- `results:visual-build` `{ index }` — build tapped.
- `results:visual-open` `{ index }` — existing explainer opened inline.
- `results:visual-share` `{ method }` — share from the embed.
- `playground:judge-declined` `{ category }` — refusal panel rendered.
- **Removed**: `playground:entry-from-review` (no emit site after D9).

Server (`logApiEvent` metadata): `/api/visual-fit` verdict distribution; `/api/playground`
`judgeCategory`/`judgeCached`/`judgeDegraded` and `notWorthy`; `/api/playground/links` count.
Post-deploy read: `npm run telemetry:report -- --days=30` — refusal rate, degraded rate, verdict
category mix, embed usage, cache hit ratio.

## 10. Testing and acceptance

**Unit (vitest; test-first for the isolated logic per AGENTS.md):**

- `src/lib/server/visualFit.test.js` — derivation: threshold boundaries, argmax/category mapping,
  missing answers, degraded shape; question builder shape.
- `src/lib/server/visualFitCache.test.js` — key normalization + version tuple (mirrors
  `explanationCache.test.js`).
- `src/lib/server/questionExplainerLinks.db.test.js` — upsert/replace semantics, identity
  isolation, newest-first listing against PGlite (pattern: `reminders.db.test.js`).
- **Removed**: `src/lib/shared/playgroundLink.test.js` (helper removed with D9).

**E2E (`tests/e2e/playground.e2e.js` extended; new `tests/e2e/visual-explanation.e2e.js`):**

1. Seeded `not_visual` verdict → `POST /api/playground` → `200 VISUAL_NOT_WORTHY`, no explainer
   row written, no generation attempted.
2. Seeded `worth_it` verdict + seeded explainer cache row → instant serve (no model).
3. Seed a link (through the testDb bridge) + seeded explainer → results page shows "Show visual
   explanation"; expand → iframe `sandbox` exactly `allow-scripts`; share URL localized; collapse
   unmounts; zero model calls.
4. Seeded `not_visual` verdict, no link → no affordance on the review card.
5. No TYPESAFE key in the test env → `/api/visual-fit` returns degraded `suggested: true` (fail-open).
6. Identity isolation: a second client sees no links for the first client's test.
7. Existing playground specs stay green: seeded-cache and stubbed-route tests never hit the judge
   (cache-first ordering), and the deep-link prefill test still covers the URL contract.

Evidence attaches through `artifactReporter.js`; the artifact stays byte-identical on a clean tree.

**Gates**: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`,
`npm run verify:vercel` (touches locales + routes per the checklist), then one
`telemetry:report --days=30` read after staging.

## 11. Rollout and verification

1. Intent record `.intent/changes/CHG-0025` (re-check the next free id): `proposal.md` with
   `Design: docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md`, scope paths for
   every new/modified file, `test_changes` for the extended `playground.e2e.js` and the removed
   `playgroundLink.test.js`; `conformance.md` before completion.
2. No feature flag (D10), no env changes, no migration beyond `ensureStorageSchema` additions.
3. Docs at implementation: `docs/architecture.md` paragraph (embed flow + judge), README endpoint
   list (`/api/visual-fit`, `/api/playground/links`, `source` field), `docs/content-quality.md`
   note that the judge is a token gate, not a quality gate.
4. Post-deploy: verify on staging one question that judges `worth_it` (build → embed → share) and
   one vague playground topic (refusal + refinement path to success); confirm telemetry has no
   `VISUAL_NOT_WORTHY` spike and no new error codes on `/api/playground` or `/api/visual-fit`.

## 12. Known limitations

- The judge is a Jev heuristic and will misjudge some questions in both directions; v1 has no
  override (D5/§2) — the escape hatches are the playground's refinement path and telemetry-led
  tuning. Degraded failures fail open, so an outage shows affordances instead of hiding them.
- Refused topics are cached only as verdicts, not as explainers; retrying with more detail is a
  new judge call (cheap, cached per content).
- Pre-login links are device-bound (mirrors `user_explainers` semantics); post-login links are
  cross-device.
- The embed captures the theme at open time; a theme switch while open re-opens on next reveal.
- Matching/assertion-format questions reach the judge as flattened text; the verdict may skew
  `not_visual` for them.
- Library provenance shows the most recent source per explainer; an explainer linked from several
  tests shows one chip.
- The artifact cannot print or work offline; the text explanation remains the printable/offline
  path.

## 13. File inventory

New:

- `src/routes/api/visual-fit/+server.js`
- `src/routes/api/playground/links/+server.js`
- `src/lib/server/visualFit.js`, `src/lib/server/visualFitCache.js`,
  `src/lib/server/visualFitJudge.js` (+ `visualFit.test.js`, `visualFitCache.test.js`)
- `src/lib/server/questionExplainerLinks.js` (+ `questionExplainerLinks.db.test.js`)
- `src/lib/client/VisualExplainerSection.svelte`
- `tests/e2e/visual-explanation.e2e.js`
- `.intent/changes/CHG-0025/**`

Modified:

- `src/routes/api/playground/+server.js` — judge gate, `source`, link recording
- `src/routes/api/playground/library/+server.js` — `source` on list items
- `src/lib/server/storage.js` — two new tables + indexes in `ensureStorageSchema`
- `src/lib/server/explainerLibrary.js` — library list joins the newest link per cache key
- `src/lib/client/ResultReviewItem.svelte` — visual section replaces the playground link
- `src/lib/client/ResultReviewList.svelte`, `src/routes/results/+page.svelte` — links map, hash
  expand, build/open/share handlers
- `src/lib/client/pages/PlaygroundPage.svelte` — judging stage, refusal panel, provenance chip
- `src/lib/client/pages/PublicExplainerPage.svelte` — "Create your own" CTA
- `src/lib/shared/telemetryEvents.js`, `src/lib/locales/english.json`,
  `src/lib/locales/hindi.json`
- `tests/e2e/playground.e2e.js` (extension; reasons recorded in `test_changes`)
- `README.md`, `docs/architecture.md`, `docs/content-quality.md`

Removed:

- `src/lib/shared/playgroundLink.js`, `src/lib/shared/playgroundLink.test.js`

Untouched: `/api/explain`, `question_explanations`, `ArtifactFrame` sandbox attributes,
`composeArtifactDocument`, the public explainer page's identity-free contract, sitemap/prerender
configuration.

## Appendix — why two pages (the user's question, answered)

`/playground` is a private, identity-scoped workspace: your library, your generation, your
searches. `/explain/[slug]` is a public, identity-free permalink: anyone with the link can view,
it is indexable/shareable, and it exposes nothing about the viewer or the creator. Merging them
would either expose the private library to shared-link visitors or kill public sharing and SEO.
The seamlessness the operator asked for is delivered by the inline embed (primary consumption),
cross-links ("Open full page", "Create your own", "From your test"), and identical components —
not by collapsing two surfaces with genuinely different contracts.
