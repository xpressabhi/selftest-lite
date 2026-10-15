import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildQuestionLinkKey,
	LIST_QUESTION_EXPLAINER_LINKS_SQL,
	recordQuestionExplainerLink,
	UPSERT_CLIENT_QUESTION_EXPLAINER_LINK_SQL,
	UPSERT_USER_QUESTION_EXPLAINER_LINK_SQL,
} from './questionExplainerLinks.js';

// A review card restores its visual from this link and the playground reads it
// as provenance, so two rules have to hold in SQL rather than in review: one
// link per (identity, test, question) no matter how often it is recorded, and
// no identity ever sees another identity's links. The list joins the caller's
// own library row and the shared concept cache, so a link whose explainer row
// is gone must disappear instead of rendering an empty card.
//
// Every statement is pinned against an in-process Postgres with the same two
// partial unique indexes the real table has: the upserts infer their arbiter
// from those exact predicates, so a schema drift here is a production failure.

let db;

async function seedLibraryRow({ userId = null, clientId = null, cacheKey, title }) {
	const { rows } = await db.query(
		`INSERT INTO user_explainers (user_id, client_id, cache_key, title)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		[userId, clientId, cacheKey, title]
	);
	return rows[0].id;
}

function seedSlug(cacheKey, slug) {
	return db.query(`INSERT INTO concept_explainers (cache_key, slug) VALUES ($1, $2)`, [
		cacheKey,
		slug,
	]);
}

function upsertClientLink({ clientId, testId, questionIndex, questionKey, cacheKey }) {
	return db.query(UPSERT_CLIENT_QUESTION_EXPLAINER_LINK_SQL, [
		clientId,
		testId,
		questionIndex,
		questionKey,
		cacheKey,
	]);
}

function upsertUserLink({
	userId,
	clientId = null,
	testId,
	questionIndex,
	questionKey,
	cacheKey,
}) {
	return db.query(UPSERT_USER_QUESTION_EXPLAINER_LINK_SQL, [
		userId,
		clientId,
		testId,
		questionIndex,
		questionKey,
		cacheKey,
	]);
}

function listLinks(testId, userId, clientId) {
	return db
		.query(LIST_QUESTION_EXPLAINER_LINKS_SQL, [testId, userId, clientId])
		.then((result) => result.rows);
}

async function countLinks(where = '') {
	const { rows } = await db.query(
		`SELECT COUNT(*)::int AS n FROM question_explainer_links ${where}`
	);
	return rows[0].n;
}

beforeAll(async () => {
	db = new PGlite();
	await db.waitReady;
	// Only the columns these statements touch, with the same nullability and
	// the same partial unique indexes the real table has.
	await db.exec(`
		CREATE TABLE question_explainer_links (
			id BIGSERIAL PRIMARY KEY,
			user_id BIGINT,
			client_id TEXT,
			test_id TEXT NOT NULL,
			question_index INTEGER NOT NULL,
			question_key TEXT NOT NULL,
			cache_key TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE UNIQUE INDEX idx_question_explainer_links_user_test
			ON question_explainer_links (user_id, test_id, question_index) WHERE user_id IS NOT NULL;
		CREATE UNIQUE INDEX idx_question_explainer_links_client_test
			ON question_explainer_links (client_id, test_id, question_index) WHERE user_id IS NULL;
		CREATE TABLE user_explainers (
			id BIGSERIAL PRIMARY KEY,
			user_id BIGINT,
			client_id TEXT,
			cache_key TEXT NOT NULL,
			title TEXT
		);
		CREATE TABLE concept_explainers (
			cache_key TEXT PRIMARY KEY,
			slug TEXT
		);
	`);
});

afterAll(async () => {
	await db?.close();
});

describe('client-branch link', () => {
	it('lists a recorded link with its library row and slug', async () => {
		const libraryId = await seedLibraryRow({
			clientId: 'c-a',
			cacheKey: 'ck-alpha',
			title: 'Voltage and current, visually',
		});
		await seedSlug('ck-alpha', 'voltage-and-current');

		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-alpha',
			questionIndex: 2,
			questionKey: 'What is V?::V = IR',
			cacheKey: 'ck-alpha',
		});

		const rows = await listLinks('t-alpha', null, 'c-a');

		expect(rows).toHaveLength(1);
		expect(rows[0].question_index, 'the question the explainer answers').toBe(2);
		expect(rows[0].library_id, 'the caller library row, not the shared cache').toBe(libraryId);
		expect(rows[0].title).toBe('Voltage and current, visually');
		expect(rows[0].slug).toBe('voltage-and-current');
		expect(rows[0].cache_key).toBe('ck-alpha');
		expect(rows[0].question_key).toBe('What is V?::V = IR');
		expect(rows[0].created_at).toBeInstanceOf(Date);
		// Exactly the columns listQuestionExplainerLinks reads; a dropped
		// column would surface as an undefined field in the API response.
		expect(Object.keys(rows[0]).sort()).toEqual([
			'cache_key',
			'created_at',
			'library_id',
			'question_index',
			'question_key',
			'slug',
			'title',
		]);
	});
});

describe('re-recording a link', () => {
	it('replaces the cache key in place instead of adding a second row', async () => {
		await seedLibraryRow({ clientId: 'c-a', cacheKey: 'ck-replace-1', title: 'First visual' });
		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-replace',
			questionIndex: 5,
			questionKey: 'Q::A',
			cacheKey: 'ck-replace-1',
		});
		// Age the row so the update's recency stamp is observable.
		await db.query(
			`UPDATE question_explainer_links SET updated_at = NOW() - INTERVAL '1 hour'
			 WHERE client_id = 'c-a' AND test_id = 't-replace' AND question_index = 5`
		);

		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-replace',
			questionIndex: 5,
			questionKey: 'Q::A',
			cacheKey: 'ck-replace-2',
		});

		expect(
			await countLinks(`WHERE client_id = 'c-a' AND test_id = 't-replace' AND question_index = 5`),
			'a re-recorded link must not duplicate'
		).toBe(1);
		const { rows } = await db.query(
			`SELECT cache_key, updated_at > NOW() - INTERVAL '10 minutes' AS refreshed
			 FROM question_explainer_links
			 WHERE client_id = 'c-a' AND test_id = 't-replace' AND question_index = 5`
		);
		expect(rows[0].cache_key).toBe('ck-replace-2');
		expect(rows[0].refreshed, 'the update stamps recency').toBe(true);
	});
});

describe('identity isolation', () => {
	it('shows a link only to the identity that recorded it', async () => {
		// Library rows exist for every identity that will look, so an empty
		// list can only come from the link predicate, never from the join.
		await seedLibraryRow({ clientId: 'c-a', cacheKey: 'ck-iso-a', title: 'Device visual' });
		await seedLibraryRow({ clientId: 'c-b', cacheKey: 'ck-iso-a', title: 'Other device visual' });
		await seedLibraryRow({ userId: 7, cacheKey: 'ck-iso-a', title: 'Signed-in copy' });
		await seedLibraryRow({ userId: 7, cacheKey: 'ck-iso-u', title: 'Signed-in visual' });
		await seedSlug('ck-iso-a', 'device-visual');
		await seedSlug('ck-iso-u', 'signed-in-visual');

		// Both identities answer the same question index: the two partial
		// indexes are disjoint, so the rows coexist.
		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-iso',
			questionIndex: 0,
			questionKey: 'Q::A',
			cacheKey: 'ck-iso-a',
		});
		await upsertUserLink({
			userId: 7,
			testId: 't-iso',
			questionIndex: 0,
			questionKey: 'Q::A',
			cacheKey: 'ck-iso-u',
		});

		const deviceRows = await listLinks('t-iso', null, 'c-a');
		expect(deviceRows.map((row) => row.cache_key)).toEqual(['ck-iso-a']);

		expect(await listLinks('t-iso', null, 'c-b'), 'another device sees nothing').toEqual([]);
		expect(
			await listLinks('t-iso', 7, null),
			'a signed-in user without the device id sees only their own row'
		).toEqual([expect.objectContaining({ cache_key: 'ck-iso-u' })]);

		// Signing in must not orphan links recorded anonymously on the same
		// device: both rows resolve for (user 7, device c-a). The pinned join
		// yields one row per matching library row, and ck-iso-a has both a
		// signed-in and a device copy, so that key appears twice; consumers
		// key the list by question_index.
		const signedInRows = await listLinks('t-iso', 7, 'c-a');
		expect(signedInRows.map((row) => row.cache_key).sort()).toEqual([
			'ck-iso-a',
			'ck-iso-a',
			'ck-iso-u',
		]);
		expect(await countLinks(`WHERE test_id = 't-iso'`)).toBe(2);
	});
});

describe('several questions in one test', () => {
	it('lists every recorded question index, newest first', async () => {
		await seedLibraryRow({ clientId: 'c-a', cacheKey: 'ck-multi', title: 'One visual' });
		await seedSlug('ck-multi', 'one-visual');
		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-multi',
			questionIndex: 0,
			questionKey: 'Q0::A0',
			cacheKey: 'ck-multi',
		});
		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-multi',
			questionIndex: 3,
			questionKey: 'Q3::A3',
			cacheKey: 'ck-multi',
		});
		await db.query(
			`UPDATE question_explainer_links SET created_at = NOW() - INTERVAL '1 hour'
			 WHERE client_id = 'c-a' AND test_id = 't-multi' AND question_index = 0`
		);

		const rows = await listLinks('t-multi', null, 'c-a');

		expect(rows.map((row) => row.question_index)).toEqual([3, 0]);
	});
});

describe('links whose library row is missing', () => {
	it('drops them instead of rendering a card without an explainer', async () => {
		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-orphan',
			questionIndex: 0,
			questionKey: 'Q::A',
			cacheKey: 'ck-orphan',
		});
		// A resolvable library row whose shared cache row is gone: the link is
		// still the caller's, so it lists with a null slug (LEFT JOIN).
		const libraryId = await seedLibraryRow({
			clientId: 'c-a',
			cacheKey: 'ck-noconcept',
			title: 'Kept visual',
		});
		await upsertClientLink({
			clientId: 'c-a',
			testId: 't-orphan',
			questionIndex: 1,
			questionKey: 'Q1::A1',
			cacheKey: 'ck-noconcept',
		});

		expect(await countLinks(`WHERE test_id = 't-orphan'`), 'both rows were written').toBe(2);

		const rows = await listLinks('t-orphan', null, 'c-a');

		expect(rows).toHaveLength(1);
		expect(rows[0].cache_key).toBe('ck-noconcept');
		expect(rows[0].library_id).toBe(libraryId);
		expect(rows[0].slug, 'a missing shared cache row is not a missing link').toBeNull();
	});
});

describe('recording without a usable input', () => {
	it('returns false and writes nothing', async () => {
		// The test process points at the configured database, so a call that
		// reached SQL would either write a row or throw: resolving false is
		// proof the guards ran before storage was consulted.
		expect(
			await recordQuestionExplainerLink(
				{},
				{ testId: 't-guard', questionIndex: 0, questionKey: 'Q::A', cacheKey: 'ck-guard' }
			),
			'no identity'
		).toBe(false);
		expect(
			await recordQuestionExplainerLink(
				{ clientId: 'tiny' },
				{ testId: 't-guard', questionIndex: 0, questionKey: 'Q::A', cacheKey: 'ck-guard' }
			),
			'a client id below the identity minimum is no identity'
		).toBe(false);
		expect(
			await recordQuestionExplainerLink(
				{ clientId: 'c-guard-1' },
				{ questionIndex: 0, questionKey: 'Q::A', cacheKey: 'ck-guard' }
			),
			'missing test id'
		).toBe(false);
		expect(
			await recordQuestionExplainerLink(
				{ clientId: 'c-guard-1' },
				{ testId: 't-guard', questionIndex: 0, questionKey: 'Q::A' }
			),
			'missing cache key'
		).toBe(false);
		expect(
			await recordQuestionExplainerLink({ clientId: 'c-guard-1' }),
			'missing fields object'
		).toBe(false);

		expect(await countLinks(`WHERE test_id = 't-guard'`)).toBe(0);
	});
});

describe('buildQuestionLinkKey', () => {
	it('joins the normalized question and answer, preserving case', () => {
		expect(buildQuestionLinkKey('  What  is\nV? ', 'V = IR')).toBe('What is V?::V = IR');
		expect(buildQuestionLinkKey('CO2 vs co2', '')).toBe('CO2 vs co2::');
		const composed = 'Caf\u00e9';
		const decomposed = 'Cafe\u0301';
		expect(buildQuestionLinkKey(decomposed, 'x'), 'NFC').toBe(`${composed}::x`);
	});
});
