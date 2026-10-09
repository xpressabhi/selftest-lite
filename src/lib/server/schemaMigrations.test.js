import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// ensureStorageSchema() short-circuits on a warm database: it compares
// app_schema.version to SCHEMA_VERSION and returns before running any DDL. That
// is what keeps serverless cold starts fast, but it means a new ALTER TABLE
// added without bumping SCHEMA_VERSION silently never runs on any database that
// is already warm — the DDL only applies to databases that happen to bootstrap
// from scratch.
//
// This happened: `hinted_indexes` was added to ai_test_attempts without a
// version bump, and /api/user/history returned 500
// (`column "hinted_indexes" does not exist`) on 81 production requests across
// two days before an unrelated version bump carried the DDL in.
//
// So the DDL is fingerprinted here. When someone edits it, this test fails and
// tells them to bump SCHEMA_VERSION in the same change.

const STORAGE_SOURCE = readFileSync(
	fileURLToPath(new URL('./storage.js', import.meta.url)),
	'utf8'
);

// Recorded whenever the DDL intentionally changes. Format:
//   '<sha256 of the normalized DDL>:<SCHEMA_VERSION it shipped with>'
const DDL_FINGERPRINT =
	'b8140dda5ed45c94b92c36d248ea496d03a60e6155f49863fd16c1985e8a4707:11';

function normalizeDdl(source) {
	const start = source.indexOf('CREATE TABLE IF NOT EXISTS app_schema');
	const endMarker = 'ON CONFLICT (id) DO UPDATE SET version = $1';
	const end = source.indexOf(endMarker);
	expect(start, 'could not find the start of the DDL block').toBeGreaterThan(-1);
	expect(end, 'could not find the end of the DDL block').toBeGreaterThan(start);
	return source
		.slice(start, end)
		.replace(/\s+/g, ' ')
		.trim();
}

function declaredSchemaVersion(source) {
	const match = source.match(/const SCHEMA_VERSION = (\d+);/);
	expect(match, 'could not find SCHEMA_VERSION in storage.js').not.toBeNull();
	return Number(match[1]);
}

describe('ensureStorageSchema warm-database guard', () => {
	it('ships the DDL that matches the recorded fingerprint', () => {
		const digest = createHash('sha256').update(normalizeDdl(STORAGE_SOURCE)).digest('hex');
		const [recordedDigest] = DDL_FINGERPRINT.split(':');

		expect(
			digest,
			'The schema DDL in ensureStorageSchema() changed but DDL_FINGERPRINT in ' +
				'src/lib/server/schemaMigrations.test.js was not updated. If this DDL is ' +
				'meant to reach warm databases, bump SCHEMA_VERSION in ' +
				'src/lib/server/storage.js in the same change — otherwise it silently ' +
				'never runs outside a cold start. Then update the fingerprint to ' +
				`'${digest}:<new SCHEMA_VERSION>'.`
		).toBe(recordedDigest);
	});

	it('records the schema version the DDL actually ships with', () => {
		const [, recordedVersion] = DDL_FINGERPRINT.split(':');
		expect(
			String(declaredSchemaVersion(STORAGE_SOURCE)),
			'The recorded fingerprint version does not match SCHEMA_VERSION in storage.js.'
		).toBe(recordedVersion);
	});

	it('adds a hinted_indexes column, the regression this guard exists for', () => {
		expect(STORAGE_SOURCE).toMatch(
			/ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS hinted_indexes/
		);
	});
});
