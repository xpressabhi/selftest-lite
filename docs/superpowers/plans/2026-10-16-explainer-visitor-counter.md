# Explainer Visitor Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each public explain page (`/explain/<slug>` and `/hi/explain/<slug>`) shows "Viewed by N people" once N ≥ 2 distinct viewers have opened it.

**Architecture:** A client-side fetch to a new `GET /api/explain/stats?slug=` records the viewer's identity-based visit and returns the distinct-viewer count; `ExplainerHeader` gains an optional `views` prop that renders the line at ≥ 2. Storage is a new `explainer_visits` ledger keyed by the explainer's stable `cache_key`, mirroring the test-stats system (CHG-0027).

**Tech Stack:** SvelteKit + Svelte 5 runes, Neon Postgres / PGlite, Playwright e2e (dev server on port 5174, seeding via the `/api/test/db` bridge), intent records under `.intent/changes/`.

**Spec:** `docs/superpowers/specs/2026-10-16-explainer-visitor-counter-design.md`

## Global Constraints

- Exact values from the spec, verbatim: table `explainer_visits` (DDL below), rate limit 120/min bucket `/api/explain:stats`, codes `INVALID_SLUG` / `EXPLAINER_NOT_FOUND` / `STATS_FETCH_ERROR`, class `.explainer-header-views`, copy `Viewed by {count} people` / `इसे {count} लोगों ने देखा है`, locale key `explainViewedBy` in **both** dictionaries.
- Never weaken an assertion; new assertions state the exact counts and exact copy.
- The `explainer_visits` DDL and the `SCHEMA_VERSION` bump (16 → 17) ship together, and `DDL_FINGERPRINT` in `src/lib/server/schemaMigrations.test.js` is updated in the same change (take the digest from the failing test's message).
- No telemetry events. `testStats.js` behavior must be identical (re-export only). The playground card must stay pixel-identical (it never passes `views`).
- Do not touch any file outside the declared scope plus the CHG-0028 record.
- Semicolons, single quotes, tabs. Every commit runs the pre-commit hook (lint + unit + full e2e, ~2 min).
- One plan-level refinement over the spec: the spec's single e2e flow lands as **two tests in one file** (`explain-stats.e2e.js`) so the server stage and the UI stage each get their own red→green cycle.

## Review Focus

- **The viewer's own visit is always counted**: the stats fetch records before returning, so a viewer never sees a count that excludes them (pinned in Task 2 test 1: probe counts; Task 3 test 2: two contexts → 2).
- **One identity counts once**: a repeat fetch with the same identity must not increment (Task 2 test 1: revisit stays 1; Task 3 test 2: Hindi revisit adds none).
- **A lone viewer sees nothing**: hidden at 1 even after the fetch lands (Task 3 test 2: `toHaveCount(0)` + server probe 1).
- **Warm databases get the table**: a missing `SCHEMA_VERSION` bump would silently never run the DDL in production (Task 2: schemaMigrations test green at 17).
- **Nothing else changes**: test-stats tests stay green through the re-export; playground card unchanged; the served HTML stays byte-identical for crawlers (Task 2/3: full suite).

---

### Task 1: Open CHG-0028

**Files:**
- Create: `.intent/changes/CHG-0028/proposal.md`

**Interfaces:**
- Consumes: the spec (`docs/superpowers/specs/2026-10-16-explainer-visitor-counter-design.md`).
- Produces: the change record later steps reference; `status: "draft"` until Task 3's conformance.

- [ ] **Step 1: Write the proposal**

Copy `.intent/changes/TEMPLATE/proposal.md`. Fill:

- `id: "CHG-0028"`, `title: "Show how many people have seen each public explain page"`, `status: "draft"`, `created_at` from `date -u +%Y-%m-%dT%H:%M:%SZ`.
- `request`: "can we add visitor counter on each explain page as well to see how many people have seen the explanation".
- `scope.paths` (exact list): `src/lib/server/visitIdentity.js`, `src/lib/server/testStats.js`, `src/lib/server/explainerCache.js`, `src/lib/server/explainerStats.js`, `src/lib/server/storage.js`, `src/lib/server/schemaMigrations.test.js`, `src/routes/api/explain/stats/+server.js`, `src/lib/client/ExplainerHeader.svelte`, `src/lib/client/pages/PublicExplainerPage.svelte`, `src/lib/locales/english.json`, `src/lib/locales/hindi.json`, `tests/e2e/explain-stats.e2e.js`, `README.md`.
- `test_changes`:
  - `path: "tests/e2e/explain-stats.e2e.js"`, `kind: "added"`, reason: "New coverage: the stats API records one row per identity, dedupes revisits, counts distinct viewers and rejects bad slugs; the browser test pins the counter hidden at one viewer and visible with exact English and Hindi copy at two."
  - `path: "src/lib/server/schemaMigrations.test.js"`, `kind: "modified"`, reason: "DDL fingerprint updated 16 → 17 alongside the explainer_visits table and SCHEMA_VERSION bump, as that guard requires; no assertion weakened."
- `links.related` as a **block sequence** (the verifier rejects non-empty flow collections): `- "CHG-0025"`, `- "CHG-0027"`.
- Body sections: Outcome, Scope (included/excluded per spec), Preserved behavior, Test changes (the two above), Decisions (client-side recording; cache_key ledger; identity reuse), Verification plan (the focused red/green runs and gates from Tasks 2–3), and a `Design: docs/superpowers/specs/2026-10-16-explainer-visitor-counter-design.md` line.

- [ ] **Step 2: Pin the digest**

Run: `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0028 --print-digest`
Paste the digest into `proposal.digest`, then rerun the same command without `--print-digest`; expect `proposal digest matches` (unused-scope warnings are fine).

- [ ] **Step 3: Commit**

```bash
git add .intent/changes/CHG-0028/proposal.md
git commit -m "chore(intent): open CHG-0028 for the explainer visitor counter"
```

---

### Task 2: Server foundation + API e2e coverage

**Files:**
- Create: `src/lib/server/visitIdentity.js`, `src/lib/server/explainerStats.js`, `src/routes/api/explain/stats/+server.js`, `tests/e2e/explain-stats.e2e.js`
- Modify: `src/lib/server/testStats.js` (lines 8–37 area), `src/lib/server/explainerCache.js:76-88`, `src/lib/server/storage.js` (DDL after the slug index ~line 554; `SCHEMA_VERSION` line 86), `src/lib/server/schemaMigrations.test.js:28`, `README.md` (endpoint table, after `/api/explain`)

**Interfaces:**
- Consumes: CHG-0028; `concept_explainers` rows; `getClientIdFromRequest` (auth.js), `getClientKey`/`logApiEvent`/`normalizeUserIdValue`/`query`/`ensureStorageSchema` (storage.js), `rateLimiter`, `getAuthenticatedUser`.
- Produces: `visitIdentity.js` exporting `normalizeClientId(value) -> string|null` and `buildVisitIdentityKey({ userId, clientId }) -> string|null`; `explainerStats.js` exporting `recordExplainerVisit({ cacheKey, userId, clientId }) -> Promise<boolean>` and `getExplainerStats({ slug, userId, clientId }) -> Promise<{ visitors: number } | null>`; the HTTP contract `GET /api/explain/stats?slug=` → 200 `{ visitors }` / 400 `INVALID_SLUG` / 404 `EXPLAINER_NOT_FOUND` / 429 / 500 `STATS_FETCH_ERROR`; `getExplainerBySlug` also returning `cache_key`.

- [ ] **Step 1: Write the failing API test**

Create `tests/e2e/explain-stats.e2e.js`:

```js
import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Public explainer visitor counter: the stats API records one row per identity
// and returns distinct viewers; the page shows the count from the second.
// Spec: docs/superpowers/specs/2026-10-16-explainer-visitor-counter-design.md

async function seedCounterExplainer(sql, { cacheKey, slug }) {
	await sql`
		INSERT INTO concept_explainers (cache_key, language, concept, payload, slug)
		VALUES (${cacheKey}, 'english', 'e2e counter probe', ${JSON.stringify({
			title: 'Counter Probe Title',
			summary: 'Counter probe summary',
			recipes: [],
			html: '<p id="e2e-counter-marker">counter body</p>',
			css: '',
			js: '',
		})}::jsonb, ${slug})
	`;
}

test('explainer stats records distinct viewers and rejects bad slugs', async ({ request }, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// Warm the schema through a real API request; the bridge does not create tables.
	await request.get('/api/test?id=1');
	const cacheKey = 'e2e-counter-probe-1';
	const slug = 'e2e-counter-probe-00000001';
	await seedCounterExplainer(sql, { cacheKey, slug });

	const first = await request.get(`/api/explain/stats?slug=${slug}`, {
		headers: { 'x-client-id': 'e2e-counter-client-alpha' },
	});
	expect(first.status()).toBe(200);
	expect(await first.json()).toEqual({ visitors: 1 });

	// The same identity again: refresh only, no new viewer.
	const revisit = await request.get(`/api/explain/stats?slug=${slug}`, {
		headers: { 'x-client-id': 'e2e-counter-client-alpha' },
	});
	expect((await revisit.json()).visitors).toBe(1);

	const second = await request.get(`/api/explain/stats?slug=${slug}`, {
		headers: { 'x-client-id': 'e2e-counter-client-beta' },
	});
	expect((await second.json()).visitors).toBe(2);

	// No identity at all: the count still answers and nothing is recorded.
	const anonymous = await request.get(`/api/explain/stats?slug=${slug}`);
	expect((await anonymous.json()).visitors).toBe(2);

	const missingSlug = await request.get('/api/explain/stats');
	expect(missingSlug.status()).toBe(400);
	expect((await missingSlug.json()).code).toBe('INVALID_SLUG');

	const unknownSlug = await request.get('/api/explain/stats?slug=definitely-missing-00000000');
	expect(unknownSlug.status()).toBe(404);
	expect((await unknownSlug.json()).code).toBe('EXPLAINER_NOT_FOUND');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			firstStatus: first.status(),
			visitorsAfterRevisit: 1,
			visitorsAfterSecond: 2,
			anonymousVisitors: 2,
			missingSlugStatus: missingSlug.status(),
			unknownSlugStatus: unknownSlug.status(),
		}),
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/explain-stats.e2e.js`
Expected: FAIL — `/api/explain/stats` is an unregistered route, so `first.status()` is 404, not 200.

- [ ] **Step 3: Extract the identity helpers**

Create `src/lib/server/visitIdentity.js` (moved verbatim from `testStats.js`, comment adjusted):

```js
import { normalizeUserIdValue } from './storage.js';

const MIN_CLIENT_ID_LENGTH = 8;

/** Trims and bounds a client-supplied device id; too-short values are noise. */
export function normalizeClientId(value) {
	return typeof value === 'string' && value.trim().length >= MIN_CLIENT_ID_LENGTH
		? value.trim().slice(0, 64)
		: null;
}

/**
 * Stable per-surface identity: signed-in users are keyed by their account so
 * visits survive a device change; anonymous visitors by the device id.
 */
export function buildVisitIdentityKey({ userId = null, clientId = null } = {}) {
	const normalizedUserId = normalizeUserIdValue(userId);
	if (normalizedUserId) {
		return `u:${normalizedUserId}`;
	}
	const normalizedClientId = normalizeClientId(clientId);
	return normalizedClientId ? `c:${normalizedClientId}` : null;
}
```

- [ ] **Step 4: Rewire `testStats.js` and prove it unchanged**

In `src/lib/server/testStats.js`: delete `MIN_CLIENT_ID_LENGTH`, `normalizeClientId`, and `buildVisitIdentityKey` (keep `MAX_DISPLAY_NAME`, `MAX_PUBLIC_SCORES`), add `import { buildVisitIdentityKey, normalizeClientId } from './visitIdentity.js';`, and re-export for existing importers:

```js
export { buildVisitIdentityKey } from './visitIdentity.js';
```

Run: `npx vitest run src/lib/server/testStats.test.js`
Expected: PASS (the re-export keeps the test's import working).

- [ ] **Step 5: Return `cache_key` from the slug lookup**

In `src/lib/server/explainerCache.js`, `getExplainerBySlug`'s SELECT becomes `payload, language, concept, slug, cache_key` (single consumer ignores the extra field).

- [ ] **Step 6: Add the visits table and bump the schema version**

In `src/lib/server/storage.js`, insert after the `idx_concept_explainers_slug` statement (~line 554):

```js
		// Per-explainer visitor ledger for the public /explain pages: one row
		// per identity that opened the page. The counter shown on the page
		// derives from this table; rows are upserted by identity and never
		// deleted (see AGENTS.md). No separate index: the UNIQUE constraint
		// already serves the count query.
		await query(`
			CREATE TABLE IF NOT EXISTS explainer_visits (
				id BIGSERIAL PRIMARY KEY,
				cache_key TEXT NOT NULL REFERENCES concept_explainers(cache_key) ON DELETE CASCADE,
				identity_key TEXT NOT NULL,
				user_id BIGINT,
				client_id TEXT,
				first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE (cache_key, identity_key)
			)
		`);
```

Change `const SCHEMA_VERSION = 16;` to `17`.

- [ ] **Step 7: Update the DDL fingerprint**

Run: `npm run test`
Expected: FAIL in `schemaMigrations.test.js` — the message prints the new digest: "Then update the fingerprint to `'<digest>:<new SCHEMA_VERSION>'`."
Set `DDL_FINGERPRINT` in `src/lib/server/schemaMigrations.test.js` to `'<digest>:17'`, rerun `npm run test`, expect PASS.

- [ ] **Step 8: Create the stats module**

Create `src/lib/server/explainerStats.js`:

```js
import { getExplainerBySlug } from './explainerCache.js';
import { ensureStorageSchema, normalizeUserIdValue, query } from './storage.js';
import { buildVisitIdentityKey, normalizeClientId } from './visitIdentity.js';

/**
 * Records (or refreshes) one identity's visit to a cached explainer. Returns
 * false when there is no identity to record; the count still answers.
 */
export async function recordExplainerVisit({ cacheKey, userId = null, clientId = null }) {
	const identityKey = buildVisitIdentityKey({ userId, clientId });
	if (!cacheKey || !identityKey) {
		return false;
	}
	await ensureStorageSchema();
	const result = await query(
		`INSERT INTO explainer_visits (cache_key, identity_key, user_id, client_id)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (cache_key, identity_key) DO UPDATE
		   SET last_seen_at = NOW()`,
		[cacheKey, identityKey, normalizeUserIdValue(userId), normalizeClientId(clientId)]
	);
	return (result.rowCount || 0) > 0;
}

/**
 * Public stats for one explainer page: resolves the slug, records the viewer's
 * own visit first (best-effort, so the count includes them), then counts
 * distinct identities. Returns null when the slug is unknown.
 */
export async function getExplainerStats({ slug, userId = null, clientId = null } = {}) {
	const row = await getExplainerBySlug(slug);
	if (!row) {
		return null;
	}
	try {
		await recordExplainerVisit({ cacheKey: row.cache_key, userId, clientId });
	} catch {
		// Bookkeeping is best-effort; the count below still answers.
	}
	const result = await query(
		`SELECT COUNT(*)::INTEGER AS visitors FROM explainer_visits WHERE cache_key = $1`,
		[row.cache_key]
	);
	return { visitors: Number(result.rows[0]?.visitors || 0) };
}
```

- [ ] **Step 9: Create the endpoint**

Create `src/routes/api/explain/stats/+server.js` by mirroring `src/routes/api/test/stats/+server.js` exactly (read it), with these deltas:

- Import `getExplainerStats` from `#lib/server/explainerStats.js` (no `recordTestVisit`/`getTestStats`).
- Rate-limit bucket `'/api/explain:stats'`, limit 120 (keep the 429 body/headers identical).
- Validation replaces the testId check: `const slug = String(url.searchParams.get('slug') ?? '').trim();` → empty → `Response.json({ error: 'Invalid slug', code: 'INVALID_SLUG' }, { status: 400 })`.
- Stats call: `const stats = await getExplainerStats({ slug, userId: user?.id || null, clientId });` → `null` → `Response.json({ error: 'Explainer not found', code: 'EXPLAINER_NOT_FOUND' }, { status: 404 })`.
- `logApiEvent`: route `'/api/explain:stats'`, action `'get_explainer_stats'`, `metadata: { slug }`.
- Success: `Response.json(stats, { headers: { 'cache-control': 'no-store' } })`.
- Catch: message `'Failed to load explainer stats'`, code `STATS_FETCH_ERROR` (500).

- [ ] **Step 10: Document the endpoint**

In `README.md`, add a table row directly after `/api/explain` (match the table's column padding):

```
| `/api/explain/stats` | GET | Public explainer viewer count (`?slug=`; records the caller's visit first, returns distinct viewers; 120/min) |
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/explain-stats.e2e.js`
Expected: 1 passed.

- [ ] **Step 12: Commit**

```bash
git add src/lib/server/visitIdentity.js src/lib/server/testStats.js src/lib/server/explainerCache.js \
	src/lib/server/explainerStats.js src/lib/server/storage.js src/lib/server/schemaMigrations.test.js \
	src/routes/api/explain/stats/+server.js tests/e2e/explain-stats.e2e.js README.md
git commit -m "feat(explain): record explainer page viewers behind a stats API"
```

---

### Task 3: Counter UI + browser e2e coverage + conformance

**Files:**
- Modify: `tests/e2e/explain-stats.e2e.js` (add test 2), `src/lib/client/ExplainerHeader.svelte`, `src/lib/client/pages/PublicExplainerPage.svelte`, `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
- Create: `.intent/changes/CHG-0028/conformance.md`; modify the proposal's `status`

**Interfaces:**
- Consumes: `GET /api/explain/stats?slug=` → `{ visitors }` (Task 2); `getClientHeaders` (`#lib/client/identity.js`, same as `TestStatsCard`); `t` (`#lib/client/i18n.js`).
- Produces: `.explainer-header-views` line on public explain pages when `views >= 2`; `ExplainerHeader` gains optional `views` prop (default 0).

- [ ] **Step 1: Write the failing browser test**

Append to `tests/e2e/explain-stats.e2e.js`:

```js
test('public explain page shows the counter from the second viewer', async ({
	browser,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');
	const cacheKey = 'e2e-counter-probe-2';
	const slug = 'e2e-counter-probe-00000002';
	await seedCounterExplainer(sql, { cacheKey, slug });

	// First viewer: the fetch records them, the line stays hidden.
	const ctx1 = await browser.newContext();
	const page1 = await ctx1.newPage();
	const firstStats = page1.waitForResponse((response) =>
		response.url().includes('/api/explain/stats')
	);
	await page1.goto(`/explain/${slug}`);
	await firstStats;
	await expect(page1.locator('.explainer-header-views')).toHaveCount(0);
	// Server-side truth: exactly one viewer (an identity-less probe never adds rows).
	const afterFirst = await request.get(`/api/explain/stats?slug=${slug}`);
	expect((await afterFirst.json()).visitors).toBe(1);

	// Second viewer (fresh context → fresh device id): the line appears.
	const ctx2 = await browser.newContext();
	const page2 = await ctx2.newPage();
	const secondStats = page2.waitForResponse((response) =>
		response.url().includes('/api/explain/stats')
	);
	await page2.goto(`/explain/${slug}`);
	await secondStats;
	await expect(page2.locator('.explainer-header-views')).toBeVisible();
	await expect(page2.locator('.explainer-header-views')).toHaveText('Viewed by 2 people');

	// The Hindi twin shares the explainer: same count, localized copy, no new viewer.
	const hindiStats = page2.waitForResponse((response) =>
		response.url().includes('/api/explain/stats')
	);
	await page2.goto(`/hi/explain/${slug}`);
	await hindiStats;
	await expect(page2.locator('.explainer-header-views')).toHaveText('इसे 2 लोगों ने देखा है');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			visitorsAfterFirst: 1,
			visitorsAfterSecond: 2,
			englishText: 'Viewed by 2 people',
			hindiText: 'इसे 2 लोगों ने देखा है',
		}),
	});
	await ctx1.close();
	await ctx2.close();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/explain-stats.e2e.js`
Expected: 1 passed, 1 failed — test 2 times out waiting for the `/api/explain/stats` response (the page never fetches yet).

- [ ] **Step 3: Add the locale key**

`src/lib/locales/english.json` (after `explainCreateOwn`, ~line 1000): `"explainViewedBy": "Viewed by {count} people",`
`src/lib/locales/hindi.json` (same position): `"explainViewedBy": "इसे {count} लोगों ने देखा है",`

- [ ] **Step 4: Give `ExplainerHeader` the views line**

In `src/lib/client/ExplainerHeader.svelte`: import `{ t } from '#lib/client/i18n.js'`; add `views = 0` to the props; render after the summary block:

```svelte
		{#if Number(views) >= 2}
			<p class="explainer-header-views">{$t('explainViewedBy', { count: views })}</p>
		{/if}
```

Add to the style block:

```css
	.explainer-header-views {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}
```

Update the component's header comment to note the optional `views` counter (public page only; the playground card passes nothing).

- [ ] **Step 5: Fetch and pass the count on the public page**

In `src/lib/client/pages/PublicExplainerPage.svelte`: import `getClientHeaders` from `#lib/client/identity.js`; add `let visitors = $state(0);`; extend `onMount` to also run (and clean up) the stats fetch:

```js
	onMount(() => {
		dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';

		// Viewer counter: the fetch records this visit, then returns the
		// distinct-viewer count (including this one). Decorative — a failed
		// fetch leaves the line hidden.
		let canceled = false;
		async function loadViews() {
			try {
				const response = await fetch(
					`/api/explain/stats?slug=${encodeURIComponent(data.slug)}`,
					{ cache: 'no-store', headers: getClientHeaders() }
				);
				if (!response.ok) {
					return;
				}
				const payload = await response.json();
				if (!canceled) {
					visitors = Number(payload?.visitors || 0);
				}
			} catch {
				// Decorative: the line stays absent.
			}
		}
		void loadViews();
		return () => {
			canceled = true;
		};
	});
```

Pass it to the header: `<ExplainerHeader title={data.title} summary={data.summary} tag="h1" size="page" views={visitors}>`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/explain-stats.e2e.js`
Expected: 2 passed.

- [ ] **Step 7: Full gates**

Run, all expected to pass: `npm run lint`, `npm run test`, `npm run test:e2e` (full suite), `npm run check`, `npm run verify:vercel` (a route and i18n were touched). Capture the pass counts.

- [ ] **Step 8: Write the conformance and complete the record**

Write `.intent/changes/CHG-0028/conformance.md` from the template: outcome vs the spec, the real verification results from steps 2/6/7 (red output, green output, suite counts), both declared test changes confirmed, decisions (the two-test split; identity extraction re-export; no separate index), the post-deploy check (open an explain page from a second device/incognito and see the counter at 2), and "Not required" approval. Set `status: "complete"` in the proposal's front matter.

- [ ] **Step 9: Commit**

```bash
git add src/lib/client/ExplainerHeader.svelte src/lib/client/pages/PublicExplainerPage.svelte \
	src/lib/locales/english.json src/lib/locales/hindi.json tests/e2e/explain-stats.e2e.js \
	.intent/changes/CHG-0028/conformance.md .intent/changes/CHG-0028/proposal.md
git commit -m "feat(explain): show the viewer counter on public explain pages"
```

- [ ] **Step 10: Verify the record**

Run: `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0028 --base <parent-of-commit> --head <commit>` (pin `--head` to the commit just created). Expected: exit 0 — digest matches, changed paths within declared scope.
