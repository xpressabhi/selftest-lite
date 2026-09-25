import { Pool } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { env } from '$env/dynamic/private';
import { createPglitePool, isPgliteUrl } from './testDb.js';
import { ARCHIVE_TABLE_STATEMENTS } from '$lib/shared/dataArchive';
import { parseReminderHour } from '$lib/shared/reminders';
import { sanitizeHintedIndexes } from './hint.js';

let poolInstance = null;
let poolPromise = null;
let schemaReadyPromise = null;

function normalizeExamId(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
}

function getPool() {
	if (!poolPromise) {
		const connectionString = env.DATABASE_URL;
		if (!connectionString) {
			return Promise.reject(new Error('DATABASE_URL is not configured'));
		}
		poolPromise = (
			isPgliteUrl(connectionString)
				? createPglitePool()
				: Promise.resolve(new Pool({ connectionString }))
		).then((pool) => {
			poolInstance = pool;
			return pool;
		});
	}
	return poolPromise;
}

export async function query(text, params = []) {
	const pool = await getPool();
	return pool.query(text, params);
}

export function getPoolStats() {
	if (!poolInstance) {
		return { total: 0, idle: 0, waiting: 0 };
	}
	return {
		total: poolInstance.totalCount,
		idle: poolInstance.idleCount,
		waiting: poolInstance.waitingCount,
	};
}

export function getClientIp(request) {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}
	return request.headers.get('x-real-ip') || 'unknown';
}

export function getClientKey(request) {
	const ip = getClientIp(request);
	const userAgent = request.headers.get('user-agent') || 'unknown';
	return createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 40);
}

/**
 * Converts a possibly-null user id into a positive integer or null.
 * NOTE: Number(null) is 0, so a bare Number() check would map "no user"
 * to user 0 and trip foreign keys.
 */
export function normalizeUserIdValue(value) {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	const normalized = Number(value);
	return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

const SCHEMA_VERSION = 9;

export async function ensureStorageSchema() {
	if (schemaReadyPromise) {
		return schemaReadyPromise;
	}

	schemaReadyPromise = (async () => {
		// Warm databases answer with one indexed lookup instead of replaying
		// every DDL statement on each serverless cold start.
		try {
			const current = await query(`SELECT version FROM app_schema WHERE id = 1`);
			if (Number(current.rows[0]?.version) === SCHEMA_VERSION) {
				return;
			}
		} catch {
			// app_schema is missing (first deploy or legacy database).
		}

		await query(`
			CREATE TABLE IF NOT EXISTS app_schema (
				id SMALLINT PRIMARY KEY,
				version INTEGER NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS ai_test (
				id BIGSERIAL PRIMARY KEY,
				test JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS topic TEXT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS test_type TEXT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS difficulty TEXT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS language TEXT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS num_questions INTEGER`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS test_mode TEXT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS exam_id TEXT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS objective_only BOOLEAN`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT`);
		await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS section_focus TEXT`);

		await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_created_at
				ON ai_test (created_at DESC)
			`);
		await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_exam_lookup
				ON ai_test (test_mode, exam_id, language, created_at DESC)
			`);

		// Planner input that produced a test. Server-only: never selected by
		// the public test endpoints. Kept as long as the test row.
		await query(`
			CREATE TABLE IF NOT EXISTS ai_test_intent (
				test_id BIGINT PRIMARY KEY REFERENCES ai_test(id) ON DELETE CASCADE,
				thread JSONB NOT NULL DEFAULT '[]'::jsonb,
				plan JSONB NOT NULL DEFAULT '{}'::jsonb,
				provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS ai_test_attempts (
				id BIGSERIAL PRIMARY KEY,
				test_id BIGINT NOT NULL REFERENCES ai_test(id) ON DELETE CASCADE,
				score INTEGER NOT NULL,
				total_questions INTEGER NOT NULL,
				time_taken INTEGER NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS user_id BIGINT
		`);
		await query(`
			ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS client_id TEXT
		`);
		await query(`
			ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS user_answers JSONB
		`);
		await query(`
			ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS hinted_indexes JSONB
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_ai_test_attempts_test_time
			ON ai_test_attempts (test_id, created_at DESC)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_ai_test_attempts_user_time
			ON ai_test_attempts (user_id, created_at DESC)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_ai_test_attempts_client_time
			ON ai_test_attempts (client_id, created_at DESC)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS app_user (
				id BIGSERIAL PRIMARY KEY,
				google_sub TEXT NOT NULL UNIQUE,
				email TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				picture_url TEXT,
				locale TEXT,
				last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_email
			ON app_user (email)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS app_user_session (
				id BIGSERIAL PRIMARY KEY,
				user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
				session_token_hash TEXT NOT NULL UNIQUE,
				expires_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_session_user_id
			ON app_user_session (user_id, expires_at DESC)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_session_expires_at
			ON app_user_session (expires_at)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS push_subscription (
				id BIGSERIAL PRIMARY KEY,
				client_id TEXT,
				user_id BIGINT,
				endpoint TEXT NOT NULL UNIQUE,
				p256dh TEXT NOT NULL,
				auth TEXT NOT NULL,
				timezone TEXT,
				enabled BOOLEAN NOT NULL DEFAULT TRUE,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_sent_at TIMESTAMPTZ,
				last_error TEXT,
				reminder_hour SMALLINT CHECK (reminder_hour BETWEEN 0 AND 23)
			)
		`);

		await query(`
			ALTER TABLE push_subscription
			ADD COLUMN IF NOT EXISTS reminder_hour SMALLINT CHECK (reminder_hour BETWEEN 0 AND 23)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_push_subscription_due
			ON push_subscription (enabled, last_sent_at)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS app_user_state (
				id BIGSERIAL PRIMARY KEY,
				user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
				client_id TEXT,
				state_key TEXT NOT NULL,
				value JSONB NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		// Migrate the legacy Next.js-era table shape (one JSONB storage blob
		// per user_id, no state_key/client_id) into the per-key table. The old
		// blob contains the same selftest_* keys as strings, so bookmarks and
		// presets saved before the SvelteKit migration are preserved.
		const stateShapeResult = await query(
			`SELECT column_name
			 FROM information_schema.columns
			 WHERE table_name = 'app_user_state'
				AND column_name IN ('state_key', 'client_id', 'storage')`
		);
		const stateColumns = stateShapeResult.rows.map((row) => row.column_name);
		const isLegacyStateShape =
			stateColumns.includes('storage') && !stateColumns.includes('state_key');
		if (isLegacyStateShape) {
			try {
				await query(`ALTER TABLE app_user_state RENAME TO app_user_state_legacy`);
				await query(`
					CREATE TABLE app_user_state (
						id BIGSERIAL PRIMARY KEY,
						user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
						client_id TEXT,
						state_key TEXT NOT NULL,
						value JSONB NOT NULL,
						updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
					)
				`);

				const legacyRows = await query(
					`SELECT user_id, storage FROM app_user_state_legacy WHERE user_id IS NOT NULL`
				);
				for (const legacyRow of legacyRows) {
					const blob = legacyRow.storage;
					if (!blob || typeof blob !== 'object') {
						continue;
					}
					for (const stateKey of [
						'selftest_bookmarked_exams',
						'selftest_bookmarked_quiz_presets',
						'selftest_bookmarks',
					]) {
						const rawValue = blob[stateKey];
						if (typeof rawValue !== 'string') {
							continue;
						}
						await query(
							`INSERT INTO app_user_state (user_id, state_key, value)
							 VALUES ($1, $2, $3::jsonb)`,
							[legacyRow.user_id, stateKey, rawValue]
						).catch(() => {
							// Best-effort migration of legacy rows.
						});
					}
				}
				// Never drop legacy data: rename it aside for forensics instead.
				await query(
					`ALTER TABLE app_user_state_legacy RENAME TO app_user_state_legacy_archive`
				);
			} catch (error) {
				console.error('Failed to migrate legacy app_user_state:', error);
			}
		}
		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_state_user
			ON app_user_state (user_id, state_key, updated_at DESC)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_state_client
			ON app_user_state (client_id, state_key, updated_at DESC)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS api_rate_limit_events (
				id BIGSERIAL PRIMARY KEY,
				client_key TEXT NOT NULL,
				route TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_api_rate_limit_events_lookup
			ON api_rate_limit_events (client_key, route, created_at DESC)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS api_request_events (
				id BIGSERIAL PRIMARY KEY,
				route TEXT NOT NULL,
				action TEXT,
				client_key TEXT,
				status_code INTEGER,
				duration_ms INTEGER,
				error_message TEXT,
				metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS user_agent TEXT
		`);
		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS ip_country TEXT
		`);
		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS ip_city TEXT
		`);
		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS ip_region TEXT
		`);
		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS ip_timezone TEXT
		`);
		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS user_id BIGINT
		`);
		await query(`
			ALTER TABLE api_request_events ADD COLUMN IF NOT EXISTS client_id TEXT
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_api_request_events_user
			ON api_request_events (user_id, created_at DESC)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_api_request_events_route_time
			ON api_request_events (route, created_at DESC)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS feature_events (
				id BIGSERIAL PRIMARY KEY,
				event TEXT NOT NULL,
				page TEXT,
				props JSONB NOT NULL DEFAULT '{}'::jsonb,
				session_id TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			ALTER TABLE feature_events ADD COLUMN IF NOT EXISTS client_id TEXT
		`);
		await query(`
			ALTER TABLE feature_events ADD COLUMN IF NOT EXISTS user_id BIGINT
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_feature_events_client
			ON feature_events (client_id, created_at DESC)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_feature_events_user
			ON feature_events (user_id, created_at DESC)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_feature_events_event_time
			ON feature_events (event, created_at DESC)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_feature_events_created
			ON feature_events (created_at)
		`);
		await query(`
			CREATE INDEX IF NOT EXISTS idx_feature_events_session
			ON feature_events (session_id, created_at DESC)
		`);

		// Cross-user explanation cache: one generated explanation per
		// question+answer+language, reused by every later request. Rows are
		// append/update only; nothing is deleted (see AGENTS.md).
		await query(`
			CREATE TABLE IF NOT EXISTS question_explanations (
				id BIGSERIAL PRIMARY KEY,
				cache_key TEXT NOT NULL UNIQUE,
				language TEXT NOT NULL DEFAULT 'english',
				explanation JSONB NOT NULL,
				model TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				use_count INTEGER NOT NULL DEFAULT 0
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_question_explanations_last_used
			ON question_explanations (last_used_at DESC)
		`);

		// Per-test visitor ledger: who opened a test, who started it, and who
		// submitted. Counters shown publicly derive from this table; rows are
		// upserted by identity and never deleted (see AGENTS.md).
		await query(`
			CREATE TABLE IF NOT EXISTS ai_test_visits (
				id BIGSERIAL PRIMARY KEY,
				test_id BIGINT NOT NULL REFERENCES ai_test(id) ON DELETE CASCADE,
				identity_key TEXT NOT NULL,
				user_id BIGINT,
				client_id TEXT,
				first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				started_at TIMESTAMPTZ,
				submitted_at TIMESTAMPTZ,
				display_name TEXT,
				UNIQUE (test_id, identity_key)
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_ai_test_visits_test
			ON ai_test_visits (test_id)
		`);

		// Discovered exam patterns, refreshed on a TTL. Payloads are updated in
		// place (never deleted) when the pattern is rediscovered.
		await query(`
			CREATE TABLE IF NOT EXISTS exam_patterns (
				id BIGSERIAL PRIMARY KEY,
				pattern_key TEXT NOT NULL UNIQUE,
				source TEXT NOT NULL,
				payload JSONB NOT NULL,
				model TEXT,
				fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				expires_at TIMESTAMPTZ NOT NULL
			)
		`);

		// Premium access grants. Revocation flips `status`; rows are never
		// deleted (see AGENTS.md). Admin sessions bypass this table.
		await query(`
			CREATE TABLE IF NOT EXISTS premium_entitlements (
				id BIGSERIAL PRIMARY KEY,
				user_id BIGINT NOT NULL,
				feature TEXT NOT NULL,
				granted_by TEXT,
				granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				expires_at TIMESTAMPTZ,
				notes TEXT,
				status TEXT NOT NULL DEFAULT 'active',
				UNIQUE (user_id, feature)
			)
		`);

		await query(`CREATE INDEX IF NOT EXISTS idx_premium_entitlements_user
			ON premium_entitlements (user_id, feature, status)
		`);

		// The original discovery target rides with the pattern so admins can
		// refresh any keyed pattern without guessing it back from the slug.
		await query(`ALTER TABLE exam_patterns ADD COLUMN IF NOT EXISTS target JSONB`);

		// Marks-aware scoring for pattern papers; count-based scoring stays as
		// the primary percentage. NULL marks mean "not a marks paper".
		await query(`ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS marks NUMERIC`);
		await query(`ALTER TABLE ai_test_attempts ADD COLUMN IF NOT EXISTS total_marks NUMERIC`);

		// Archive tables preserve anything that leaves a hot table; nothing
		// is ever dropped (see src/lib/shared/dataArchive.js).
		for (const statement of ARCHIVE_TABLE_STATEMENTS) {
			await query(statement);
		}

		await query(
			`INSERT INTO app_schema (id, version, updated_at)
			 VALUES (1, $1, NOW())
			 ON CONFLICT (id) DO UPDATE SET version = $1, updated_at = NOW()`,
			[SCHEMA_VERSION]
		);
	})().catch((error) => {
		schemaReadyPromise = null;
		throw error;
	});

	return schemaReadyPromise;
}

export async function createTestRecord(test, requestParams = {}) {
	await ensureStorageSchema();

	const topic = test?.topic || requestParams.topic || null;
	const testType = requestParams.testType || null;
	const difficulty = requestParams.difficulty || null;
	const language = requestParams.language || null;
	const testMode = requestParams.testMode || null;
	const examId = normalizeExamId(requestParams.examId);
	const sectionFocus = normalizeExamId(requestParams.sectionFocus);
	const objectiveOnly =
		typeof requestParams.objectiveOnly === 'boolean' ? requestParams.objectiveOnly : null;
	const durationMinutes = Number.isFinite(Number(requestParams.durationMinutes))
		? Number(requestParams.durationMinutes)
		: null;
	const numQuestions = Number.isInteger(requestParams.numQuestions)
		? requestParams.numQuestions
		: Array.isArray(test?.questions)
			? test.questions.length
			: null;
	const createdByUserId = normalizeUserIdValue(requestParams.createdByUserId);

	const result = await query(
		`INSERT INTO ai_test
		 (test, topic, test_type, difficulty, language, num_questions, test_mode, exam_id, objective_only, duration_minutes, created_by_user_id, section_focus)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id`,
		[
			JSON.stringify(test),
			topic,
			testType,
			difficulty,
			language,
			numQuestions,
			testMode,
			examId,
			objectiveOnly,
			durationMinutes,
			createdByUserId,
			sectionFocus,
		]
	);

	return result.rows[0]?.id;
}

/**
 * Stores the sanitized planner capture for a test. Best-effort by contract:
 * callers log failures and keep the generated test.
 */
export async function saveTestIntentRecord({ testId, thread = [], plan = {}, provenance = {} }) {
	const normalizedTestId = Number(testId);
	if (!Number.isInteger(normalizedTestId) || normalizedTestId <= 0) {
		return false;
	}
	await ensureStorageSchema();
	await query(
		`INSERT INTO ai_test_intent (test_id, thread, plan, provenance)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (test_id) DO NOTHING`,
		[
			JSON.stringify(Array.isArray(thread) ? thread : []),
			JSON.stringify(plan && typeof plan === 'object' ? plan : {}),
			JSON.stringify(provenance && typeof provenance === 'object' ? provenance : {}),
		]
	);
	return true;
}

export async function getTestRecordById(id) {
	await ensureStorageSchema();

	const normalizedId = Number(id);
	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return null;
	}

	const result = await query(
		`SELECT
			id,
			test,
			created_at,
			topic,
			test_type,
			difficulty,
			language,
			num_questions
		 FROM ai_test
		 WHERE id = $1`,
		[normalizedId]
	);

	return result.rows[0] || null;
}

export async function createTestAttempt({
	testId,
	score,
	totalQuestions,
	timeTaken,
	userId = null,
	clientId = null,
	userAnswers = null,
	hintedIndexes = null,
	marks = null,
	totalMarks = null,
}) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserIdValue(userId);
	const normalizedClientId =
		typeof clientId === 'string' && clientId.length <= 64 ? clientId : null;
	const normalizedUserAnswers =
		userAnswers && typeof userAnswers === 'object' && !Array.isArray(userAnswers)
			? JSON.stringify(userAnswers)
			: null;
	const normalizedHintedIndexes =
		hintedIndexes && typeof hintedIndexes === 'object' && !Array.isArray(hintedIndexes)
			? JSON.stringify(hintedIndexes)
			: null;
	const normalizedMarks = Number.isFinite(Number(marks)) ? Number(marks) : null;
	const normalizedTotalMarks = Number.isFinite(Number(totalMarks)) ? Number(totalMarks) : null;

	const result = await query(
		`INSERT INTO ai_test_attempts
		 (test_id, user_id, client_id, user_answers, score, total_questions, time_taken, hinted_indexes, marks, total_marks)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id`,
		[
			testId,
			normalizedUserId,
			normalizedClientId,
			normalizedUserAnswers,
			score,
			totalQuestions,
			timeTaken,
			normalizedHintedIndexes,
			normalizedMarks,
			normalizedTotalMarks,
		]
	);

	return result.rows[0]?.id;
}

function normalizeAttemptIdentity({ userId = null, clientId = null } = {}) {
	const normalizedUserId = normalizeUserIdValue(userId);
	const normalizedClientId =
		typeof clientId === 'string' && clientId.trim().length >= 8
			? clientId.trim().slice(0, 64)
			: null;
	return { userId: normalizedUserId, clientId: normalizedClientId };
}

/**
 * Finds the current user's attempt for a test. Prefers a logged-in user_id,
 * then falls back to the anonymous client_id on the same device.
 */
export async function getMyAttemptForIdentity(testId, identity = {}) {
	await ensureStorageSchema();

	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return null;
	}

	const result = await query(
		`SELECT
			a.score,
			a.total_questions,
			a.time_taken,
			a.user_answers,
			a.marks,
			a.total_marks,
			a.created_at AS submitted_at
		 FROM ai_test_attempts a
		 WHERE a.test_id = $1
			AND (a.user_id = $2 OR a.client_id = $3)
		 ORDER BY a.created_at DESC
		 LIMIT 1`,
		[testId, userId, clientId]
	);

	return result.rows[0] || null;
}

/**
 * Lists a user's (or anonymous device's) submissions with test summaries.
 */
export async function listAttemptsForIdentity(identity = {}, { limit = 100 } = {}) {
	await ensureStorageSchema();

	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return [];
	}

	const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
	const whereClauses = [];
	const queryParams = [];

	if (userId) {
		queryParams.push(userId);
		whereClauses.push(`a.user_id = $${queryParams.length}`);
	}
	if (clientId) {
		queryParams.push(clientId);
		whereClauses.push(`a.client_id = $${queryParams.length}`);
	}

	queryParams.push(cappedLimit);
	const result = await query(
		`SELECT
			a.test_id,
			a.score,
			a.total_questions,
			a.time_taken,
			a.user_answers,
			a.created_at AS submitted_at,
			t.test,
			t.topic,
			t.test_type,
			t.difficulty,
			t.language,
			t.num_questions
		 FROM ai_test_attempts a
		 INNER JOIN ai_test t ON t.id = a.test_id
		 WHERE ${whereClauses.join(' OR ')}
		 ORDER BY a.created_at DESC
		 LIMIT $${queryParams.length}`,
		queryParams
	);

	return result.rows;
}

/**
 * Upserts attempts pushed from the client (offline replay / pre-login
 * history). Dedupes on the same (identity, test, submitted_at) combination so
 * replays never create duplicates.
 */
export async function upsertUserTestAttempts(identity, attempts = []) {
	await ensureStorageSchema();

	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if ((!userId && !clientId) || !Array.isArray(attempts) || attempts.length === 0) {
		return 0;
	}

	let insertedCount = 0;
	for (const attempt of attempts.slice(0, 200)) {
		const testId = Number(attempt?.testId);
		if (!Number.isInteger(testId) || testId <= 0) {
			continue;
		}

		const submittedAtRaw = attempt?.submittedAt ? new Date(attempt.submittedAt) : new Date();
		const submittedAt = Number.isNaN(submittedAtRaw.getTime()) ? new Date() : submittedAtRaw;

		const userAnswers =
			attempt?.userAnswers &&
			typeof attempt.userAnswers === 'object' &&
			!Array.isArray(attempt.userAnswers)
				? JSON.stringify(attempt.userAnswers)
				: null;
		let normalizedHints = null;
		if (
			attempt?.hintedIndexes &&
			typeof attempt.hintedIndexes === 'object' &&
			!Array.isArray(attempt.hintedIndexes)
		) {
			const record = await getTestRecordById(testId).catch(() => null);
			const clean = sanitizeHintedIndexes(
				attempt.hintedIndexes,
				record?.test?.questions || []
			);
			normalizedHints = Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
		}
		const score = Number.isFinite(Number(attempt?.score))
			? Math.max(0, Number(attempt.score))
			: null;
		const totalQuestions = Number.isFinite(Number(attempt?.totalQuestions))
			? Math.max(0, Number(attempt.totalQuestions))
			: null;
		const timeTaken = Number.isFinite(Number(attempt?.timeTaken))
			? Math.max(0, Number(attempt.timeTaken))
			: null;
		const marks = Number.isFinite(Number(attempt?.marks)) ? Number(attempt.marks) : null;
		const totalMarks = Number.isFinite(Number(attempt?.totalMarks))
			? Number(attempt.totalMarks)
			: null;

		if (score === null || totalQuestions === null) {
			continue;
		}

		const dedupeResult = await query(
			`SELECT 1
			 FROM ai_test_attempts
			 WHERE test_id = $1
				AND created_at = $2
				AND score = $3
				AND (user_id IS NOT DISTINCT FROM $4)
				AND (client_id IS NOT DISTINCT FROM $5)
			 LIMIT 1`,
			[testId, submittedAt.toISOString(), score, userId, clientId]
		);
		if (dedupeResult.rows.length > 0) {
			continue;
		}

		const result = await query(
			`INSERT INTO ai_test_attempts
			 (test_id, user_id, client_id, user_answers, score, total_questions, time_taken, hinted_indexes, created_at, marks, total_marks)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			[
				testId,
				userId,
				clientId,
				userAnswers,
				score,
				totalQuestions,
				timeTaken,
				normalizedHints,
				submittedAt.toISOString(),
				marks,
				totalMarks,
			]
		);
		insertedCount += result.rowCount || 0;
	}

	return insertedCount;
}

/**
 * Reads all synced state rows for an identity (user_id or client_id).
 * Returns { stateKey: value } with the newest row winning per key.
 */
export async function getStateForIdentity(identity = {}) {
	await ensureStorageSchema();

	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return {};
	}

	const whereClauses = [];
	const queryParams = [];
	if (userId) {
		queryParams.push(userId);
		whereClauses.push(`user_id = $${queryParams.length}`);
	}
	if (clientId) {
		queryParams.push(clientId);
		whereClauses.push(`client_id = $${queryParams.length}`);
	}

	const result = await query(
		`SELECT state_key, value, updated_at
		 FROM app_user_state
		 WHERE ${whereClauses.join(' OR ')}
		 ORDER BY state_key, updated_at DESC`,
		queryParams
	);

	const storage = {};
	for (const row of result.rows) {
		if (row.state_key in storage) {
			continue; // newest row for this key already recorded
		}
		storage[row.state_key] = row.value;
	}
	return storage;
}

/**
 * Upserts one state key for an identity. Prefers updating an existing row so
 * the same (identity, key) never accumulates duplicates; a residual dedupe
 * also runs after login backfills. A row belongs to the identity when it is
 * user-owned (user_id matches) or anonymous on the same device (user_id is
 * NULL and client_id matches) — never by a bare NULL user_id, which would
 * hijack rows owned by other anonymous clients.
 */
export async function upsertStateForIdentity(identity, stateKey, value) {
	await ensureStorageSchema();

	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if ((!userId && !clientId) || typeof stateKey !== 'string') {
		return false;
	}

	const updateResult = await query(
		`UPDATE app_user_state
		 SET user_id = $1, client_id = $2, value = $4, updated_at = NOW()
		 WHERE state_key = $3
			AND (user_id = $1 OR (user_id IS NULL AND client_id = $2))`,
		[userId, clientId, stateKey, value]
	);
	if (updateResult.rowCount > 0) {
		return true;
	}

	const insertResult = await query(
		`INSERT INTO app_user_state (user_id, client_id, state_key, value)
		 VALUES ($1, $2, $3, $4)`,
		[userId, clientId, stateKey, value]
	);
	return (insertResult.rowCount || 0) > 0;
}

/**
 * Deletes one state key for an identity. Like upsertStateForIdentity, a row
 * belongs to the identity when it is user-owned or anonymous on the same
 * device. Returns true when a row was removed.
 */
export async function deleteStateForIdentity(identity, stateKey) {
	await ensureStorageSchema();

	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if ((!userId && !clientId) || typeof stateKey !== 'string') {
		return false;
	}

	const result = await query(
		`WITH moved AS (
			DELETE FROM app_user_state
			WHERE state_key = $1
				AND (user_id = $2 OR (user_id IS NULL AND client_id = $3))
			RETURNING *
		)
		INSERT INTO app_user_state_archive
		SELECT *, NOW() FROM moved`,
		[stateKey, userId, clientId]
	);
	return (result.rowCount || 0) > 0;
}

/**
 * After a successful login, attributes all anonymous activity carrying the
 * same client_id to the newly authenticated user.
 */
export async function backfillUserIdentity(userId, clientId) {
	const normalizedUserId = normalizeUserIdValue(userId);
	if (!normalizedUserId || !clientId) {
		return 0;
	}

	await ensureStorageSchema();

	let totalBackfilled = 0;
	for (const table of ['ai_test_attempts', 'feature_events', 'api_request_events']) {
		try {
			const result = await query(
				`UPDATE ${table}
				 SET user_id = $1
				 WHERE client_id = $2 AND user_id IS NULL`,
				[normalizedUserId, clientId]
			);
			totalBackfilled += result.rowCount || 0;
		} catch (error) {
			console.error(`Failed to backfill user identity for ${table}:`, error);
		}
	}

	await query(
		`UPDATE ai_test
		 SET created_by_user_id = $1
		 WHERE created_by_user_id IS NULL
			AND test->'requestParams'->>'clientId' = $2`,
		[normalizedUserId, clientId]
	).catch((error) => {
		console.error('Failed to backfill ai_test creator:', error);
	});

	try {
		await query(
			`UPDATE app_user_state
			 SET user_id = $1, client_id = NULL
			 WHERE client_id = $2 AND user_id IS NULL`,
			[normalizedUserId, clientId]
		);
		// A user row may already exist for a key (earlier login on another
		// device): keep the newest row per (user_id, state_key) and archive
		// the superseded rows instead of dropping them.
		await query(
			`WITH moved AS (
				DELETE FROM app_user_state a
				USING app_user_state b
				WHERE a.user_id = b.user_id
					AND a.state_key = b.state_key
					AND a.id <> b.id
					AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id > b.id))
				RETURNING a.*
			)
			INSERT INTO app_user_state_archive
			SELECT *, NOW() FROM moved`
		);
	} catch (error) {
		console.error('Failed to backfill user state:', error);
	}

	return totalBackfilled;
}

export async function getTestRecordsByIds(ids) {
	await ensureStorageSchema();

	const normalizedIds = Array.isArray(ids)
		? ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
		: [];

	if (normalizedIds.length === 0) {
		return [];
	}

	const result = await query(
		`SELECT
			id,
			test
		 FROM ai_test
		 WHERE id = ANY($1::bigint[])`,
		[normalizedIds]
	);

	return result.rows;
}

export async function findReusableFullExamRecord({ examId, language, excludedTestIds = [] }) {
	await ensureStorageSchema();

	const normalizedExamId = normalizeExamId(examId);
	const normalizedLanguage =
		typeof language === 'string' && language.trim() ? language.trim().toLowerCase() : null;
	const normalizedExcludedTestIds = Array.isArray(excludedTestIds)
		? excludedTestIds
				.map((value) => Number(value))
				.filter((value) => Number.isInteger(value) && value > 0)
		: [];

	if (!normalizedExamId || !normalizedLanguage) {
		return null;
	}

	const queryParams = [normalizedExamId];
	const whereClauses = [];

	queryParams.push(normalizedLanguage);
	whereClauses.push(
		`COALESCE(t.language, LOWER(t.test->'requestParams'->>'language'), 'english') = $${queryParams.length}`
	);
	whereClauses.push(
		`(
			(t.test_mode = 'full-exam' AND t.exam_id = $1)
			OR (
				COALESCE(t.test->'requestParams'->>'testMode', '') = 'full-exam'
				AND COALESCE(t.test->'requestParams'->>'examId', '') = $1
			)
		)`
	);
	queryParams.push(normalizedExcludedTestIds);
	whereClauses.push(`NOT (t.id = ANY($${queryParams.length}::bigint[]))`);
	whereClauses.push(
		`jsonb_array_length(
			CASE
				WHEN jsonb_typeof((t.test::jsonb)->'questions') = 'array'
					THEN (t.test::jsonb)->'questions'
				ELSE '[]'::jsonb
			END
		) > 0`
	);

	const result = await query(
		`SELECT
			t.id,
			t.test,
			t.created_at,
			t.topic,
			t.test_type,
			t.difficulty,
			t.language,
			t.num_questions
		 FROM ai_test t
		 WHERE ${whereClauses.join(' AND ')}
		 ORDER BY t.created_at DESC
		 LIMIT 1`,
		queryParams
	);

	return result.rows[0] || null;
}

export async function listTestRecords({
	search = '',
	limit = 10,
	offset = 0,
	language = 'all',
	examType = 'all',
} = {}) {
	await ensureStorageSchema();

	const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 21);
	const normalizedOffset = Math.max(Number(offset) || 0, 0);
	const trimmedSearch = search.trim();
	const normalizedLanguage = String(language || '')
		.trim()
		.toLowerCase();
	const normalizedExamType = String(examType || '')
		.trim()
		.toLowerCase();
	const hasLanguageFilter = ['english', 'hindi'].includes(normalizedLanguage);
	const hasExamTypeFilter = ['full-exam', 'quiz-practice'].includes(normalizedExamType);

	const whereClauses = [];
	const queryParams = [];

	if (trimmedSearch) {
		queryParams.push(`%${trimmedSearch}%`);
		whereClauses.push(
			`(COALESCE(topic, test->>'topic', '') ILIKE $${queryParams.length} OR CAST(id AS TEXT) ILIKE $${queryParams.length})`
		);
	}

	if (hasLanguageFilter) {
		queryParams.push(normalizedLanguage);
		whereClauses.push(
			`LOWER(COALESCE(language, test->'requestParams'->>'language', 'english')) = $${queryParams.length}`
		);
	}

	if (hasExamTypeFilter) {
		queryParams.push(normalizedExamType);
		whereClauses.push(
			`LOWER(COALESCE(test_mode, test->'requestParams'->>'testMode', 'quiz-practice')) = $${queryParams.length}`
		);
	}

	queryParams.push(cappedLimit);
	queryParams.push(normalizedOffset);
	const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

	const result = await query(
		`SELECT
			id,
			COALESCE(topic, test->>'topic', 'Untitled test') AS topic,
			COALESCE(test_type, test->'requestParams'->>'testType', 'multiple-choice') AS test_type,
			COALESCE(difficulty, test->'requestParams'->>'difficulty', 'intermediate') AS difficulty,
			LOWER(COALESCE(language, test->'requestParams'->>'language', 'english')) AS language,
			num_questions,
			LOWER(COALESCE(test_mode, test->'requestParams'->>'testMode', 'quiz-practice')) AS test_mode,
			created_at
		 FROM ai_test
		 ${whereSql}
		 ORDER BY created_at DESC, id DESC
		 LIMIT $${queryParams.length - 1}
		 OFFSET $${queryParams.length}`,
		queryParams
	);

	return result.rows;
}

export async function getRecentQuestionsForTopic({ topic, language, limit = 30 } = {}) {
	await ensureStorageSchema();

	const trimmedTopic = String(topic || '').trim();
	if (!trimmedTopic) {
		return [];
	}
	const cappedLimit = Math.min(Math.max(Number(limit) || 30, 1), 60);
	const normalizedLanguage = String(language || 'english').toLowerCase();

	const result = await query(
		`SELECT
			q.value AS question,
			q.value->>'answer' AS answer
		 FROM ai_test t
		 CROSS JOIN LATERAL jsonb_array_elements((t.test::jsonb)->'questions') AS q(value)
		 WHERE t.created_at >= NOW() - INTERVAL '90 days'
			AND LOWER(COALESCE(t.topic, t.test::jsonb->>'topic', '')) = LOWER($1)
			AND LOWER(COALESCE(t.language, t.test::jsonb->'requestParams'->>'language', 'english')) = $2
		 ORDER BY t.created_at DESC
		 LIMIT $3`,
		[trimmedTopic, normalizedLanguage, cappedLimit]
	);

	// `question` is the full stored question object (JSONB), so structured
	// formats keep their columns/assertion fields for dedupe and prompts.
	return result.rows;
}

function extractClientContext(request) {
	if (!request || typeof request.headers?.get !== 'function') {
		return {
			userAgent: null,
			ipCountry: null,
			ipCity: null,
			ipRegion: null,
			ipTimezone: null,
		};
	}
	const header = (name, maxLength) => {
		const value = request.headers.get(name);
		return value ? value.slice(0, maxLength) : null;
	};
	return {
		userAgent: header('user-agent', 300),
		ipCountry: header('x-vercel-ip-country', 16),
		ipCity: header('x-vercel-ip-city', 64),
		ipRegion: header('x-vercel-ip-country-region', 64),
		ipTimezone: header('x-vercel-ip-timezone', 64),
	};
}

export async function logApiEvent({
	route,
	action = null,
	clientKey = null,
	clientId = null,
	statusCode = null,
	durationMs = null,
	errorMessage = null,
	metadata = {},
	request = null,
	userId = null,
}) {
	try {
		await ensureStorageSchema();
		const { userAgent, ipCountry, ipCity, ipRegion, ipTimezone } =
			extractClientContext(request);
		const normalizedUserId = normalizeUserIdValue(userId);
		const normalizedClientId =
			typeof clientId === 'string' && clientId.length <= 64 ? clientId : null;
		await query(
			`INSERT INTO api_request_events
			 (route, action, client_key, client_id, status_code, duration_ms, error_message, metadata, user_agent, ip_country, ip_city, ip_region, ip_timezone, user_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)`,
			[
				route,
				action,
				clientKey,
				normalizedClientId,
				statusCode,
				durationMs,
				errorMessage,
				JSON.stringify(metadata || {}),
				userAgent,
				ipCountry,
				ipCity,
				ipRegion,
				ipTimezone,
				normalizedUserId,
			]
		);
	} catch (error) {
		console.error('Failed to log API event:', error);
	}
}

export async function savePushSubscription({
	clientId = null,
	userId = null,
	endpoint,
	p256dh,
	auth,
	timezone = null,
	reminderHour = null,
}) {
	await ensureStorageSchema();

	if (
		typeof endpoint !== 'string' ||
		!endpoint.startsWith('https://') ||
		typeof p256dh !== 'string' ||
		!p256dh ||
		typeof auth !== 'string' ||
		!auth
	) {
		return false;
	}

	const normalizedUserId = normalizeUserIdValue(userId);
	const normalizedClientId =
		typeof clientId === 'string' && clientId.length <= 64 ? clientId : null;
	const normalizedTimezone =
		typeof timezone === 'string' && timezone.length <= 64 ? timezone : null;
	const normalizedHour = parseReminderHour(reminderHour);
	if (normalizedHour === undefined) {
		return false;
	}

	await query(
		`INSERT INTO push_subscription
			(client_id, user_id, endpoint, p256dh, auth, timezone, enabled, updated_at, reminder_hour)
		 VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), $7)
		 ON CONFLICT (endpoint) DO UPDATE SET
			client_id = EXCLUDED.client_id,
			user_id = COALESCE(EXCLUDED.user_id, push_subscription.user_id),
			p256dh = EXCLUDED.p256dh,
			auth = EXCLUDED.auth,
			timezone = EXCLUDED.timezone,
			reminder_hour = EXCLUDED.reminder_hour,
			-- A changed time starts its own schedule: the old last-send must
			-- not suppress the first reminder at the new hour.
			last_sent_at = CASE
				WHEN push_subscription.reminder_hour IS DISTINCT FROM EXCLUDED.reminder_hour
				THEN NULL
				ELSE push_subscription.last_sent_at
			END,
			enabled = TRUE,
			updated_at = NOW()`,
		[normalizedClientId, normalizedUserId, endpoint, p256dh, auth, normalizedTimezone, normalizedHour]
	);
	return true;
}

/**
 * Changes the reminder hour for one subscription. A changed hour clears the
 * last-send so the new slot can fire the same day, and re-enables the row (a
 * 404/410 send may have disabled it).
 */
export async function updatePushSubscriptionHour(endpoint, hour) {
	await ensureStorageSchema();
	if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
		return false;
	}
	const normalizedHour = parseReminderHour(hour);
	if (normalizedHour === undefined) {
		return false;
	}
	const result = await query(
		`UPDATE push_subscription
		 SET reminder_hour = $2::smallint,
			last_sent_at = CASE
				WHEN reminder_hour IS DISTINCT FROM $2::smallint THEN NULL
				ELSE last_sent_at
			END,
			enabled = TRUE,
			updated_at = NOW()
		 WHERE endpoint = $1`,
		[endpoint, normalizedHour]
	);
	return (result.rowCount || 0) > 0;
}

export async function archivePushSubscription(endpoint) {
	await ensureStorageSchema();
	if (typeof endpoint !== 'string' || !endpoint) {
		return false;
	}
	// Explicit column lists: `SELECT *, NOW()` only lines up while the archive
	// column order still matches the source, and a new source column lands
	// after the archive's archived_at.
	const result = await query(
		`WITH moved AS (
			DELETE FROM push_subscription WHERE endpoint = $1 RETURNING *
		)
		INSERT INTO push_subscription_archive
			(id, client_id, user_id, endpoint, p256dh, auth, timezone, enabled,
			 created_at, updated_at, last_sent_at, last_error, reminder_hour, archived_at)
		SELECT id, client_id, user_id, endpoint, p256dh, auth, timezone, enabled,
			created_at, updated_at, last_sent_at, last_error, reminder_hour, NOW()
		FROM moved`,
		[endpoint]
	);
	return (result.rowCount || 0) > 0;
}

export async function archiveOldRateLimitEvents() {
	await ensureStorageSchema();
	await query(
		`WITH moved AS (
			DELETE FROM api_rate_limit_events
			WHERE created_at < NOW() - INTERVAL '2 days'
			RETURNING *
		)
		INSERT INTO api_rate_limit_events_archive
		SELECT *, NOW() FROM moved`
	);
}

export async function getAdminStats({ recentLimit = 50, days = 0 } = {}) {
	await ensureStorageSchema();

	const cappedRecentLimit = Math.min(Math.max(Number(recentLimit) || 50, 1), 200);
	const cappedDays = Math.min(Math.max(Number(days) || 0, 0), 365);
	const durationFilter =
		cappedDays > 0 ? `created_at >= NOW() - INTERVAL '${cappedDays} days'` : '';
	const durationWhere = durationFilter ? `WHERE ${durationFilter}` : '';
	const rateLimitFilter =
		cappedDays > 0
			? `created_at >= NOW() - INTERVAL '${cappedDays} days'`
			: `created_at >= NOW() - INTERVAL '24 hours'`;
	const [
		totalsResult,
		byRouteResult,
		byStatusResult,
		hourlyResult,
		byCountryResult,
		topAgentsResult,
		rateLimitedResult,
		recentResult,
	] = await Promise.all([
		query(
			`SELECT
				COUNT(*)::INTEGER AS total,
				COUNT(*) FILTER (WHERE status_code >= 400 AND status_code NOT IN (401, 429))::INTEGER AS errors,
				COALESCE(ROUND(AVG(duration_ms)), 0)::INTEGER AS avg_duration_ms,
				MIN(created_at) AS first_event,
				MAX(created_at) AS last_event
			 FROM api_request_events
			 ${durationWhere}`
		),
		query(
			`SELECT
				route,
				COUNT(*)::INTEGER AS requests,
				COUNT(*) FILTER (WHERE status_code >= 400 AND status_code NOT IN (401, 429))::INTEGER AS errors,
				COALESCE(ROUND(AVG(duration_ms)), 0)::INTEGER AS avg_duration_ms
			 FROM api_request_events
			 ${durationWhere}
			 GROUP BY route
			 ORDER BY requests DESC`
		),
		query(
			`SELECT
				status_code,
				COUNT(*)::INTEGER AS requests
			 FROM api_request_events
			 ${durationWhere}
			 GROUP BY status_code
			 ORDER BY requests DESC`
		),
		query(
			`SELECT
				date_trunc('hour', created_at) AS bucket,
				COUNT(*)::INTEGER AS requests
			 FROM api_request_events
			 WHERE created_at >= NOW() - INTERVAL '${cappedDays > 0 ? cappedDays : 24} hours'
			 GROUP BY bucket
			 ORDER BY bucket`
		),
		query(
			`SELECT
				COALESCE(NULLIF(ip_country, ''), 'unknown') AS country,
				COUNT(*)::INTEGER AS requests
			 FROM api_request_events
			 ${durationWhere}
			 GROUP BY country
			 ORDER BY requests DESC
			 LIMIT 20`
		),
		query(
			`SELECT
				user_agent,
				COUNT(*)::INTEGER AS requests
			 FROM api_request_events
			 WHERE user_agent IS NOT NULL AND user_agent <> ''
			 ${durationFilter ? `AND ${durationFilter}` : ''}
			 GROUP BY user_agent
			 ORDER BY requests DESC
			 LIMIT 15`
		),
		query(
			`SELECT
				route,
				COUNT(*)::INTEGER AS events
			 FROM api_rate_limit_events
			 WHERE ${rateLimitFilter}
			 GROUP BY route
			 ORDER BY events DESC`
		),
		query(
			`SELECT
				id,
				route,
				action,
				status_code,
				duration_ms,
				error_message,
				client_key,
				ip_country,
				ip_city,
				ip_timezone,
				user_agent,
				created_at
			 FROM api_request_events
			 ${durationWhere}
			 ORDER BY id DESC
			 LIMIT $1`,
			[cappedRecentLimit]
		),
	]);

	return {
		totals: totalsResult.rows[0] || null,
		byRoute: byRouteResult.rows,
		byStatus: byStatusResult.rows,
		hourly: hourlyResult.rows,
		byCountry: byCountryResult.rows,
		topAgents: topAgentsResult.rows,
		rateLimited: rateLimitedResult.rows,
		recent: recentResult.rows,
	};
}

export async function getFeatureUsageStats({ days = 30, limit = 60 } = {}) {
	await ensureStorageSchema();

	const cappedDays = Math.min(Math.max(Number(days) || 30, 1), 90);
	const cappedLimit = Math.min(Math.max(Number(limit) || 60, 1), 200);

	const [totalsResult, byEventResult, byPageResult, trendResult, generateBreakdownResult] =
		await Promise.all([
			query(
				`SELECT
				COUNT(*)::INTEGER AS total,
				COUNT(DISTINCT session_id)::INTEGER AS sessions,
				MIN(created_at) AS first_at,
				MAX(created_at) AS last_at,
				COALESCE(ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT session_id), 0), 1), 0) AS events_per_session
			 FROM feature_events
			 WHERE created_at >= NOW() - ($1::text || ' days')::interval`,
				[cappedDays]
			),
			query(
				`SELECT
				event,
				COUNT(*)::INTEGER AS count
			 FROM feature_events
			 WHERE created_at >= NOW() - ($1::text || ' days')::interval
			 GROUP BY event
			 ORDER BY count DESC
			 LIMIT $2`,
				[cappedDays, cappedLimit]
			),
			query(
				`SELECT
				COALESCE(NULLIF(page, ''), '(unknown)') AS page,
				COUNT(*)::INTEGER AS events
			 FROM feature_events
			 WHERE created_at >= NOW() - ($1::text || ' days')::interval
			 GROUP BY page
			 ORDER BY events DESC
			 LIMIT 25`,
				[cappedDays]
			),
			query(
				`SELECT
				date_trunc('day', created_at) AS day,
				COUNT(*)::INTEGER AS events,
				COUNT(DISTINCT session_id)::INTEGER AS sessions
			 FROM feature_events
			 WHERE created_at >= NOW() - ($1::text || ' days')::interval
			 GROUP BY day
			 ORDER BY day`,
				[cappedDays]
			),
			query(
				`SELECT
				COALESCE(props->>'mode', '(none)') AS mode,
				COALESCE(props->>'difficulty', '(none)') AS difficulty,
				COALESCE(props->>'language', '(none)') AS language,
				COUNT(*)::INTEGER AS count
			 FROM feature_events
			 WHERE event IN ('generate:start', 'generate:success')
				AND created_at >= NOW() - ($1::text || ' days')::interval
			 GROUP BY mode, difficulty, language
			 ORDER BY count DESC
			 LIMIT 30`,
				[cappedDays]
			),
		]);

	const byEvent = byEventResult.rows;
	const total = totalsResult.rows?.[0]?.total || 0;
	for (const row of byEvent) {
		row.pct = total > 0 ? Number(((row.count / total) * 100).toFixed(1)) : 0;
	}

	return {
		totals: totalsResult.rows[0] || null,
		byEvent,
		byPage: byPageResult.rows,
		trend: trendResult.rows,
		generateBreakdown: generateBreakdownResult.rows,
	};
}

const DEVICE_BUCKET_ORDER = {
	type: ['slow-2g', '2g', '3g', '4g', 'unknown'],
	downlink: ['lt025', '025-05', '05-1', '1-2', '2-5', '5-10', '10p', 'unknown'],
	rtt: ['lt100', '100-200', '200-400', '400-800', '800-1500', '1500p', 'unknown'],
};

export async function getDeviceNetworkStats({ days = 30 } = {}) {
	await ensureStorageSchema();

	const cappedDays = Math.min(Math.max(Number(days) || 30, 1), 90);

	const [tiersResult, modelsResult, networkResult, generateResult, coverageResult] =
		await Promise.all([
			query(
				`WITH latest AS (
					SELECT DISTINCT ON (COALESCE(user_id::text, client_id))
						COALESCE(user_id::text, client_id) AS identity,
						props
					FROM feature_events
					WHERE event = 'device:profile'
						AND created_at >= NOW() - ($1::text || ' days')::interval
						AND COALESCE(user_id::text, client_id) IS NOT NULL
					ORDER BY COALESCE(user_id::text, client_id), created_at DESC
				)
				SELECT
					COALESCE(NULLIF(props->>'tier', ''), 'unknown') AS tier,
					COUNT(*)::INTEGER AS identities
				FROM latest
				GROUP BY 1
				ORDER BY identities DESC`,
				[cappedDays]
			),
			query(
				`WITH latest AS (
					SELECT DISTINCT ON (COALESCE(user_id::text, client_id))
						COALESCE(user_id::text, client_id) AS identity,
						props
					FROM feature_events
					WHERE event = 'device:profile'
						AND created_at >= NOW() - ($1::text || ' days')::interval
						AND COALESCE(user_id::text, client_id) IS NOT NULL
					ORDER BY COALESCE(user_id::text, client_id), created_at DESC
				)
				SELECT
					COALESCE(NULLIF(props->>'model', ''), 'unknown') AS model,
					COALESCE(NULLIF(props->>'android', ''), 'unknown') AS android,
					COUNT(*)::INTEGER AS identities
				FROM latest
				WHERE props->>'tier' = 'low'
				GROUP BY 1, 2
				ORDER BY identities DESC
				LIMIT 10`,
				[cappedDays]
			),
			query(
				`WITH session_net AS (
					SELECT session_id,
						MIN(CASE props->>'type' WHEN 'slow-2g' THEN 0 WHEN '2g' THEN 1 WHEN '3g' THEN 2 WHEN '4g' THEN 3 END)
							FILTER (WHERE props->>'type' IN ('slow-2g', '2g', '3g', '4g')) AS type_rank,
						MIN(CASE props->>'down' WHEN 'lt025' THEN 0 WHEN '025-05' THEN 1 WHEN '05-1' THEN 2 WHEN '1-2' THEN 3 WHEN '2-5' THEN 4 WHEN '5-10' THEN 5 WHEN '10p' THEN 6 END)
							FILTER (WHERE props->>'down' IN ('lt025', '025-05', '05-1', '1-2', '2-5', '5-10', '10p')) AS down_rank,
						MAX(CASE props->>'rtt' WHEN 'lt100' THEN 0 WHEN '100-200' THEN 1 WHEN '200-400' THEN 2 WHEN '400-800' THEN 3 WHEN '800-1500' THEN 4 WHEN '1500p' THEN 5 END)
							FILTER (WHERE props->>'rtt' IN ('lt100', '100-200', '200-400', '400-800', '800-1500', '1500p')) AS rtt_rank
					FROM feature_events
					WHERE event IN ('device:profile', 'net:change')
						AND session_id IS NOT NULL
						AND created_at >= NOW() - ($1::text || ' days')::interval
					GROUP BY session_id
				)
				SELECT 'type' AS dimension,
					CASE type_rank WHEN 0 THEN 'slow-2g' WHEN 1 THEN '2g' WHEN 2 THEN '3g' WHEN 3 THEN '4g' ELSE 'unknown' END AS bucket,
					COUNT(*)::INTEGER AS sessions
				FROM session_net
				GROUP BY 1, 2
				UNION ALL
				SELECT 'downlink',
					CASE down_rank WHEN 0 THEN 'lt025' WHEN 1 THEN '025-05' WHEN 2 THEN '05-1' WHEN 3 THEN '1-2' WHEN 4 THEN '2-5' WHEN 5 THEN '5-10' WHEN 6 THEN '10p' ELSE 'unknown' END,
					COUNT(*)::INTEGER
				FROM session_net
				GROUP BY 1, 2
				UNION ALL
				SELECT 'rtt',
					CASE rtt_rank WHEN 0 THEN 'lt100' WHEN 1 THEN '100-200' WHEN 2 THEN '200-400' WHEN 3 THEN '400-800' WHEN 4 THEN '800-1500' WHEN 5 THEN '1500p' ELSE 'unknown' END,
					COUNT(*)::INTEGER
				FROM session_net
				GROUP BY 1, 2`,
				[cappedDays]
			),
			query(
				`SELECT
					COALESCE(net.bucket, 'unknown') AS bucket,
					COUNT(*) FILTER (WHERE fe.event = 'generate:success')::INTEGER AS succeeded,
					COUNT(*) FILTER (WHERE fe.event = 'generate:fail')::INTEGER AS failed,
					ROUND(
						AVG(
							CASE
								WHEN fe.event = 'generate:fail' AND fe.props->>'elapsedSeconds' ~ '^[0-9]{1,6}$'
								THEN (fe.props->>'elapsedSeconds')::numeric
							END
						),
						1
					) AS avg_fail_seconds
				FROM feature_events fe
				LEFT JOIN LATERAL (
					SELECT props->>'down' AS bucket
					FROM feature_events n
					WHERE n.session_id = fe.session_id
						AND n.event IN ('device:profile', 'net:change')
						AND n.created_at <= fe.created_at
					ORDER BY n.created_at DESC
					LIMIT 1
				) net ON TRUE
				WHERE fe.event IN ('generate:success', 'generate:fail')
					AND fe.created_at >= NOW() - ($1::text || ' days')::interval
				GROUP BY 1`,
				[cappedDays]
			),
			query(
				`SELECT
					COUNT(DISTINCT session_id) FILTER (WHERE event = 'page:view')::INTEGER AS page_sessions,
					COUNT(DISTINCT session_id) FILTER (WHERE event = 'device:profile')::INTEGER AS profile_sessions
				FROM feature_events
				WHERE event IN ('page:view', 'device:profile')
					AND session_id IS NOT NULL
					AND created_at >= NOW() - ($1::text || ' days')::interval`,
				[cappedDays]
			),
		]);

	const tiers = tiersResult.rows;
	const identityTotal = tiers.reduce((sum, row) => sum + row.identities, 0);
	for (const row of tiers) {
		row.pct = identityTotal > 0 ? Number(((row.identities / identityTotal) * 100).toFixed(1)) : 0;
	}

	const networkRows = networkResult.rows;
	const network = {};
	for (const dimension of ['type', 'downlink', 'rtt']) {
		const rows = networkRows.filter((row) => row.dimension === dimension);
		const total = rows.reduce((sum, row) => sum + row.sessions, 0);
		network[dimension] = DEVICE_BUCKET_ORDER[dimension].map((bucket) => {
			const match = rows.find((row) => row.bucket === bucket);
			const sessions = match?.sessions ?? 0;
			return {
				bucket,
				sessions,
				pct: total > 0 ? Number(((sessions / total) * 100).toFixed(1)) : 0,
			};
		});
	}

	const generateByDownlink = DEVICE_BUCKET_ORDER.downlink.map((bucket) => {
		const row = generateResult.rows.find((entry) => entry.bucket === bucket) || {};
		const succeeded = row.succeeded ?? 0;
		const failed = row.failed ?? 0;
		const started = succeeded + failed;
		return {
			bucket,
			started,
			failed,
			failRate: started > 0 ? Number(((failed / started) * 100).toFixed(1)) : null,
			avgFailSeconds: row.avg_fail_seconds ?? null,
		};
	});

	const downlinkBuckets = DEVICE_BUCKET_ORDER.downlink.filter((bucket) => bucket !== 'unknown');
	const downlinkCounts = downlinkBuckets.map((bucket) => ({
		bucket,
		sessions: network.downlink.find((row) => row.bucket === bucket)?.sessions ?? 0,
	}));
	const downlinkTotal = downlinkCounts.reduce((sum, row) => sum + row.sessions, 0);
	let floor = null;
	if (downlinkTotal > 0) {
		let cumulative = 0;
		for (const row of downlinkCounts) {
			if (cumulative + row.sessions >= downlinkTotal * 0.1) {
				const floorRank = downlinkBuckets.indexOf(row.bucket);
				const atOrBelow = generateByDownlink.filter((entry) => {
					const rank = downlinkBuckets.indexOf(entry.bucket);
					return rank !== -1 && rank <= floorRank;
				});
				const startedBelow = atOrBelow.reduce((sum, entry) => sum + entry.started, 0);
				const failedBelow = atOrBelow.reduce((sum, entry) => sum + entry.failed, 0);
				floor = {
					bucket: row.bucket,
					rttBucket: null,
					coveragePct: Number((((downlinkTotal - cumulative) / downlinkTotal) * 100).toFixed(1)),
					failPct: startedBelow > 0 ? Number(((failedBelow / startedBelow) * 100).toFixed(1)) : null,
					startedBelow,
					failedBelow,
				};
				break;
			}
			cumulative += row.sessions;
		}
	}
	const rttBuckets = DEVICE_BUCKET_ORDER.rtt.filter((bucket) => bucket !== 'unknown');
	const rttTotal = network.rtt
		.filter((row) => row.bucket !== 'unknown')
		.reduce((sum, row) => sum + row.sessions, 0);
	if (floor && rttTotal > 0) {
		let cumulative = 0;
		for (const bucket of rttBuckets) {
			cumulative += network.rtt.find((row) => row.bucket === bucket)?.sessions ?? 0;
			if (cumulative >= rttTotal * 0.9) {
				floor.rttBucket = bucket;
				break;
			}
		}
	}

	const coverageRow = coverageResult.rows[0] || {};
	const coverage = {
		pageSessions: coverageRow.page_sessions || 0,
		profileSessions: coverageRow.profile_sessions || 0,
		sharePct:
			coverageRow.page_sessions > 0
				? Number(((coverageRow.profile_sessions / coverageRow.page_sessions) * 100).toFixed(1))
				: null,
	};

	return {
		identities: identityTotal,
		tiers,
		topLowModels: modelsResult.rows,
		network,
		generateByDownlink,
		floor,
		coverage,
	};
}

export async function getDatabaseOverview({ days = 7 } = {}) {
	await ensureStorageSchema();

	const cappedDays = Math.min(Math.max(Number(days) || 7, 1), 365);
	const filter = `created_at >= NOW() - INTERVAL '${cappedDays} days'`;

	const [
		tests,
		attempts,
		users,
		activeSessions,
		stateUsers,
		rateLimits,
		requestEvents,
		featureEvents,
		testModes,
		testDifficulties,
		testLanguages,
		attemptScores,
	] = await Promise.all([
		query(
			`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE ${filter})::INTEGER AS recent FROM ai_test`
		),
		query(
			`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE ${filter})::INTEGER AS recent, COALESCE(ROUND(AVG(score) FILTER (WHERE ${filter})), 0)::INTEGER AS avg_score, COALESCE(ROUND(AVG(time_taken) FILTER (WHERE ${filter})), 0)::INTEGER AS avg_time_seconds FROM ai_test_attempts`
		),
		query(
			`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '${cappedDays} days')::INTEGER AS recent FROM app_user`
		),
		query(`SELECT COUNT(*)::INTEGER AS active FROM app_user_session WHERE expires_at > NOW()`),
		query(
			`SELECT COUNT(DISTINCT COALESCE(user_id::text, client_id))::INTEGER AS total, COUNT(DISTINCT COALESCE(user_id::text, client_id)) FILTER (WHERE updated_at >= NOW() - INTERVAL '${cappedDays} days')::INTEGER AS recent FROM app_user_state`
		),
		query(
			`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE ${filter})::INTEGER AS recent FROM api_rate_limit_events`
		),
		query(
			`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE ${filter})::INTEGER AS recent, COUNT(*) FILTER (WHERE status_code >= 400 AND status_code NOT IN (401, 429) AND ${filter})::INTEGER AS errors FROM api_request_events`
		),
		query(
			`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE ${filter})::INTEGER AS recent, COUNT(DISTINCT session_id) FILTER (WHERE ${filter})::INTEGER AS sessions FROM feature_events`
		),
		query(
			`SELECT test_mode, COUNT(*)::INTEGER AS count FROM ai_test WHERE ${filter} GROUP BY test_mode ORDER BY count DESC`
		),
		query(
			`SELECT difficulty, COUNT(*)::INTEGER AS count FROM ai_test WHERE ${filter} GROUP BY difficulty ORDER BY count DESC`
		),
		query(
			`SELECT language, COUNT(*)::INTEGER AS count FROM ai_test WHERE ${filter} GROUP BY language ORDER BY count DESC`
		),
		query(
			`SELECT ROUND(AVG(score))::INTEGER AS avg_score, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score)::INTEGER AS median_score, COUNT(*) FILTER (WHERE score = total_questions)::INTEGER AS perfect_scores FROM ai_test_attempts WHERE ${filter}`
		),
	]);

	return {
		durationDays: cappedDays,
		tables: {
			ai_test: { total: tests.rows[0]?.total || 0, recent: tests.rows[0]?.recent || 0 },
			ai_test_attempts: {
				total: attempts.rows[0]?.total || 0,
				recent: attempts.rows[0]?.recent || 0,
				avg_score: attempts.rows[0]?.avg_score || 0,
				avg_time_seconds: attempts.rows[0]?.avg_time_seconds || 0,
			},
			app_user: { total: users.rows[0]?.total || 0, recent: users.rows[0]?.recent || 0 },
			app_user_session: { active: activeSessions.rows[0]?.active || 0 },
			app_user_state: {
				distinct_users: stateUsers.rows[0]?.total || 0,
				recent: stateUsers.rows[0]?.recent || 0,
			},
			api_rate_limit_events: {
				total: rateLimits.rows[0]?.total || 0,
				recent: rateLimits.rows[0]?.recent || 0,
			},
			api_request_events: {
				total: requestEvents.rows[0]?.total || 0,
				recent: requestEvents.rows[0]?.recent || 0,
				errors: requestEvents.rows[0]?.errors || 0,
			},
			feature_events: {
				total: featureEvents.rows[0]?.total || 0,
				recent: featureEvents.rows[0]?.recent || 0,
				sessions: featureEvents.rows[0]?.sessions || 0,
			},
		},
		testBreakdown: {
			byMode: testModes.rows,
			byDifficulty: testDifficulties.rows,
			byLanguage: testLanguages.rows,
		},
		attemptStats: attemptScores.rows[0] || {},
	};
}

export async function getRequestHealthMetrics({ windowSeconds = 60 } = {}) {
	await ensureStorageSchema();

	const cappedWindow = Math.min(Math.max(Number(windowSeconds) || 60, 5), 3600);
	const result = await query(
		`SELECT
			COUNT(*)::INTEGER AS total,
			COUNT(*) FILTER (WHERE status_code >= 400 AND status_code NOT IN (401, 429))::INTEGER AS errors,
			COALESCE(ROUND(AVG(duration_ms)), 0)::INTEGER AS avg_latency_ms,
			COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY duration_ms)::INTEGER, 0) AS p90_latency_ms,
			COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms)::INTEGER, 0) AS p99_latency_ms
		 FROM api_request_events
		 WHERE created_at >= NOW() - ($1::text || ' seconds')::interval`,
		[cappedWindow]
	);

	const row = result.rows[0] || {};
	const total = row.total || 0;
	const errors = row.errors || 0;

	return {
		scope: 'all-instances',
		windowSeconds: cappedWindow,
		total,
		requestsPerSecond: Number((total / cappedWindow).toFixed(2)),
		avgLatencyMs: row.avg_latency_ms || 0,
		p90LatencyMs: row.p90_latency_ms || 0,
		p99LatencyMs: row.p99_latency_ms || 0,
		errors,
		errorRate: total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0,
	};
}

export async function getDatabaseHealth() {
	await ensureStorageSchema();

	const startedAt = Date.now();
	await query('SELECT 1');
	const latencyMs = Date.now() - startedAt;

	let connections;
	try {
		const result = await query(
			`SELECT
				COUNT(*)::INTEGER AS total,
				COUNT(*) FILTER (WHERE state = 'active')::INTEGER AS active,
				COUNT(*) FILTER (WHERE state = 'idle')::INTEGER AS idle
			 FROM pg_stat_activity
			 WHERE datname = current_database()`
		);
		const row = result.rows[0] || {};
		connections = {
			scope: 'database',
			total: row.total || 0,
			active: row.active || 0,
			idle: row.idle || 0,
			instancePool: getPoolStats(),
		};
	} catch (error) {
		console.error(error);
		connections = {
			scope: 'database',
			total: null,
			active: null,
			idle: null,
			instancePool: getPoolStats(),
		};
	}

	return { latencyMs, connections };
}
