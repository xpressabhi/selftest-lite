import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildArchiveMoveSql,
	EXAM_NOTIFICATION_ARCHIVE_TARGETS,
	EXAM_NOTIFICATION_SCHEMA_STATEMENTS,
	INSERT_QUARANTINE_SQL,
	INSERT_SYNC_RUN_SQL,
	MARK_SOURCE_SUGGESTIONS_ADDED_SQL,
	READ_LATEST_SYNC_RUN_SQL,
	READ_PENDING_SOURCE_SUGGESTIONS_SQL,
	READ_PUBLISHED_NOTIFICATIONS_SQL,
	toNotificationItem,
	UPSERT_EXAM_NOTIFICATION_SQL,
	UPSERT_SOURCE_SUGGESTION_SQL
} from './examNotificationSql';

// The store is where every data-loss and visibility rule lives, so each
// statement is pinned against an in-process Postgres:
// duplicate upserts, dates that must not be erased by later empty extractions,
// quarantine that must never clobber or leak, archive moves that must preserve
// rows, and the read window that must not hide still-open recruitments.

const TODAY = '2026-09-26';

let db;

// dedupe_key, source, title, published, applyEnd, examDate, confidence
function upsertParams(overrides = {}) {
	const row = {
		dedupeKey: 'key-1',
		sourceId: 'ssc',
		org: 'Staff Selection Commission',
		title: 'CGL 2026 Notice',
		category: 'ssc-central',
		state: null,
		examId: 'ssc-cgl',
		notificationUrl: 'https://ssc.gov.in/notice',
		applyUrl: null,
		publishedAt: '2026-09-01',
		applyStart: null,
		applyEnd: '2026-10-01',
		examDate: null,
		vacancies: 100,
		qualification: 'Graduate',
		confidence: 0.9,
		...overrides
	};
	return [
		row.dedupeKey,
		row.sourceId,
		row.org,
		row.title,
		row.category,
		row.state,
		row.examId,
		row.notificationUrl,
		row.applyUrl,
		row.publishedAt,
		row.applyStart,
		row.applyEnd,
		row.examDate,
		row.vacancies,
		row.qualification,
		row.confidence
	];
}

beforeAll(async () => {
	db = new PGlite();
	for (const statement of EXAM_NOTIFICATION_SCHEMA_STATEMENTS) {
		await db.query(statement);
	}
});

afterAll(async () => {
	await db?.close();
});

describe('upsert', () => {
	it('inserts once and updates on the second run without duplicating', async () => {
		const first = await db.query(UPSERT_EXAM_NOTIFICATION_SQL, upsertParams());
		expect(first.rows[0].inserted).toBe(true);
		const second = await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({ title: 'CGL 2026 Notice (revised)' })
		);
		expect(second.rows[0].inserted).toBe(false);
		const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM exam_notification WHERE dedupe_key = 'key-1'`);
		expect(rows[0].n).toBe(1);
		const stored = await db.query(`SELECT title FROM exam_notification WHERE dedupe_key = 'key-1'`);
		expect(stored.rows[0].title).toBe('CGL 2026 Notice (revised)');
	});

	it('never erases stored dates when a later extraction misses them', async () => {
		await db.query(UPSERT_EXAM_NOTIFICATION_SQL, upsertParams({ dedupeKey: 'key-dates' }));
		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({ dedupeKey: 'key-dates', applyEnd: null, publishedAt: null })
		);
		const { rows } = await db.query(
			`SELECT to_char(apply_end, 'YYYY-MM-DD') AS apply_end, to_char(published_at, 'YYYY-MM-DD') AS published_at
			 FROM exam_notification WHERE dedupe_key = 'key-dates'`
		);
		expect(rows[0].apply_end).toBe('2026-10-01');
		expect(rows[0].published_at).toBe('2026-09-01');
	});

	it('updates a date when the later extraction does supply one', async () => {
		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({ dedupeKey: 'key-dates', applyEnd: '2026-11-15' })
		);
		const { rows } = await db.query(
			`SELECT to_char(apply_end, 'YYYY-MM-DD') AS apply_end FROM exam_notification WHERE dedupe_key = 'key-dates'`
		);
		expect(rows[0].apply_end).toBe('2026-11-15');
	});
});

describe('quarantine', () => {
	it('stores a hidden row with its failure reason and payload', async () => {
		await db.query(INSERT_QUARANTINE_SQL, [
			'key-quarantine',
			'upsc',
			'UPSC',
			'Suspect item',
			null,
			null,
			null,
			'https://upsc.gov.in/x',
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			'link_unreachable',
			JSON.stringify({ title: 'Suspect item' })
		]);
		const { rows } = await db.query(READ_PUBLISHED_NOTIFICATIONS_SQL, ['2025-09-26', 500]);
		expect(rows.some((row) => row.dedupe_key === 'key-quarantine')).toBe(false);
		const hidden = await db.query(
			`SELECT review_status, failure_reason, raw_json FROM exam_notification WHERE dedupe_key = 'key-quarantine'`
		);
		expect(hidden.rows[0].review_status).toBe('quarantined');
		expect(hidden.rows[0].failure_reason).toBe('link_unreachable');
		expect(hidden.rows[0].raw_json).toEqual({ title: 'Suspect item' });
	});

	it('never clobbers a published row', async () => {
		await db.query(INSERT_QUARANTINE_SQL, [
			'key-1',
			'ssc',
			'SSC',
			'CGL 2026 Notice',
			null,
			null,
			null,
			'https://ssc.gov.in/notice',
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			'low_confidence',
			null
		]);
		const { rows } = await db.query(
			`SELECT review_status, failure_reason FROM exam_notification WHERE dedupe_key = 'key-1'`
		);
		expect(rows[0].review_status).toBe('published');
		expect(rows[0].failure_reason).toBe(null);
	});

	it('promotes a quarantined row once it validates', async () => {
		await db.query(INSERT_QUARANTINE_SQL, [
			'key-promote',
			'ssc',
			'SSC',
			'CHSL notice',
			null,
			null,
			null,
			'https://ssc.gov.in/chsl',
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			'link_unreachable',
			JSON.stringify({ title: 'CHSL notice' })
		]);
		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({
				dedupeKey: 'key-promote',
				title: 'CHSL notice',
				notificationUrl: 'https://ssc.gov.in/chsl'
			})
		);
		const { rows } = await db.query(
			`SELECT review_status, failure_reason, raw_json FROM exam_notification WHERE dedupe_key = 'key-promote'`
		);
		expect(rows[0].review_status).toBe('published');
		expect(rows[0].failure_reason).toBe(null);
		expect(rows[0].raw_json).toBe(null);
	});
});

describe('published read window', () => {
	it('hides old closed rows but keeps still-open long-running ones, up to the limit', async () => {
		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({
				dedupeKey: 'key-old-closed',
				title: 'Old closed',
				publishedAt: '2024-01-01',
				applyEnd: '2024-02-01'
			})
		);
		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({
				dedupeKey: 'key-old-open',
				title: 'Long running open',
				publishedAt: '2024-01-01',
				applyEnd: '2026-10-15'
			})
		);
		await db.query(
			`UPDATE exam_notification SET first_seen_at = NOW() - INTERVAL '2 years' WHERE dedupe_key IN ('key-old-closed', 'key-old-open')`
		);
		const { rows } = await db.query(READ_PUBLISHED_NOTIFICATIONS_SQL, ['2025-09-26', 500]);
		const keys = rows.map((row) => row.dedupe_key);
		expect(keys).toContain('key-old-open');
		expect(keys).not.toContain('key-old-closed');
		expect(keys).toContain('key-1');
	});

	it('never returns quarantined rows', async () => {
		const { rows } = await db.query(READ_PUBLISHED_NOTIFICATIONS_SQL, ['2025-09-26', 500]);
		expect(rows.every((row) => row.dedupe_key !== 'key-quarantine')).toBe(true);
	});

	it('maps rows to UI items with derived status and new badge', async () => {
		const { rows } = await db.query(READ_PUBLISHED_NOTIFICATIONS_SQL, ['2025-09-26', 500]);
		const item = toNotificationItem(rows.find((row) => row.dedupe_key === 'key-1'), TODAY, new Date());
		expect(item).toMatchObject({
			sourceId: 'ssc',
			examId: 'ssc-cgl',
			applyEnd: '2026-10-01',
			status: 'closing_soon',
			isNew: true
		});
	});
});

describe('sync runs', () => {
	it('trusts the latest successful run and ignores failed ones', async () => {
		await db.query(INSERT_SYNC_RUN_SQL, [
			new Date(),
			'partial',
			8,
			7,
			1,
			3,
			2,
			1,
			0,
			JSON.stringify([{ source: 'ncs', error: 'timeout' }])
		]);
		await db.query(INSERT_SYNC_RUN_SQL, [
			new Date(),
			'failed',
			8,
			0,
			8,
			0,
			0,
			0,
			0,
			JSON.stringify([])
		]);
		const { rows } = await db.query(READ_LATEST_SYNC_RUN_SQL);
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('partial');
		expect(rows[0].sources_failed).toBe(1);
	});
});

describe('source suggestions', () => {
	it('dedupes by URL, keeps pending ones updated and marks added ones', async () => {
		const first = await db.query(UPSERT_SOURCE_SUGGESTION_SQL, [
			'https://www.rbi.org.in/careers',
			'RBI',
			'banking',
			'grounded discovery'
		]);
		await db.query(UPSERT_SOURCE_SUGGESTION_SQL, [
			'https://www.rbi.org.in/careers',
			'RBI',
			'banking',
			'seen again'
		]);
		const pending = await db.query(READ_PENDING_SOURCE_SUGGESTIONS_SQL);
		expect(pending.rows).toHaveLength(1);
		expect(pending.rows[0].reason).toBe('seen again');
		const marked = await db.query(MARK_SOURCE_SUGGESTIONS_ADDED_SQL, [[first.rows[0].id]]);
		expect(marked.rows).toHaveLength(1);
		const after = await db.query(READ_PENDING_SOURCE_SUGGESTIONS_SQL);
		expect(after.rows).toHaveLength(0);
	});
});

describe('archive moves', () => {
	it('moves only long-closed published rows and preserves them in the archive', async () => {
		// Source column layout for both archive targets.
		await db.query(`CREATE TABLE IF NOT EXISTS exam_notification_archive (LIKE exam_notification INCLUDING DEFAULTS)`);
		await db.query(
			`ALTER TABLE exam_notification_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
		);

		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({
				dedupeKey: 'key-archive-me',
				title: 'Archived notice',
				publishedAt: '2024-06-01',
				applyEnd: '2024-07-01'
			})
		);
		await db.query(
			UPSERT_EXAM_NOTIFICATION_SQL,
			upsertParams({
				dedupeKey: 'key-still-seen',
				title: 'Old but seen recently',
				publishedAt: '2024-06-01',
				applyEnd: '2024-07-01'
			})
		);
		await db.query(
			`UPDATE exam_notification
			 SET first_seen_at = NOW() - INTERVAL '300 days', last_seen_at = NOW() - INTERVAL '200 days'
			 WHERE dedupe_key IN ('key-archive-me', 'key-still-seen')`
		);
		await db.query(
			`UPDATE exam_notification SET last_seen_at = NOW() WHERE dedupe_key = 'key-still-seen'`
		);

		const movedPublished = await db.query(buildArchiveMoveSql(EXAM_NOTIFICATION_ARCHIVE_TARGETS[0], 100));
		expect(movedPublished.rows.map((row) => row.id)).toHaveLength(1);

		const remaining = await db.query(
			`SELECT dedupe_key FROM exam_notification WHERE dedupe_key IN ('key-archive-me', 'key-still-seen')`
		);
		expect(remaining.rows.map((row) => row.dedupe_key)).toEqual(['key-still-seen']);

		const archived = await db.query(
			`SELECT title, apply_end, archived_at FROM exam_notification_archive WHERE dedupe_key = 'key-archive-me'`
		);
		expect(archived.rows).toHaveLength(1);
		expect(archived.rows[0].title).toBe('Archived notice');
		expect(archived.rows[0].archived_at).toBeInstanceOf(Date);
	});

	it('archives stale quarantine rows through the second target', async () => {
		await db.query(
			`UPDATE exam_notification SET first_seen_at = NOW() - INTERVAL '200 days' WHERE dedupe_key = 'key-quarantine'`
		);
		const moved = await db.query(buildArchiveMoveSql(EXAM_NOTIFICATION_ARCHIVE_TARGETS[1], 100));
		expect(moved.rows).toHaveLength(1);
		const archived = await db.query(
			`SELECT review_status FROM exam_notification_archive WHERE dedupe_key = 'key-quarantine'`
		);
		expect(archived.rows[0].review_status).toBe('quarantined');
	});
});
