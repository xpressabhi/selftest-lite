import { Pool } from '@neondatabase/serverless';
import { createHash } from 'crypto';

let poolInstance = null;
let schemaReadyPromise = null;

function normalizeUserId(value) {
	const parsedValue = Number(value);
	if (Number.isInteger(parsedValue) && parsedValue > 0) {
		return parsedValue;
	}
	return null;
}

function normalizeExamId(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
}

function getPool() {
	if (!poolInstance) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error('DATABASE_URL is not configured');
		}
		poolInstance = new Pool({ connectionString });
	}
	return poolInstance;
}

export async function query(text, params = []) {
	return getPool().query(text, params);
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
	return createHash('sha256')
		.update(`${ip}|${userAgent}`)
		.digest('hex')
		.slice(0, 40);
}

export async function ensureStorageSchema() {
	if (schemaReadyPromise) {
		return schemaReadyPromise;
	}

	schemaReadyPromise = (async () => {
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
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS test_mode TEXT`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS exam_id TEXT`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS objective_only BOOLEAN`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);

			await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_created_at
				ON ai_test (created_at DESC)
			`);
			await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_created_by_user_id
				ON ai_test (created_by_user_id, created_at DESC)
			`);
			await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_exam_lookup
				ON ai_test (test_mode, exam_id, language, created_at DESC)
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
			CREATE TABLE IF NOT EXISTS app_user_state (
				user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
				storage JSONB NOT NULL DEFAULT '{}'::jsonb,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_state_updated_at
			ON app_user_state (updated_at DESC)
		`);

		await query(`
			CREATE TABLE IF NOT EXISTS app_user_test_attempt (
				id BIGSERIAL PRIMARY KEY,
				user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
				test_id BIGINT NOT NULL REFERENCES ai_test(id) ON DELETE CASCADE,
				user_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
				score INTEGER,
				total_questions INTEGER,
				time_taken INTEGER,
				submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE (user_id, test_id)
			)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_test_attempt_user_time
			ON app_user_test_attempt (user_id, submitted_at DESC)
		`);

		await query(`
			CREATE INDEX IF NOT EXISTS idx_app_user_test_attempt_test
			ON app_user_test_attempt (test_id)
		`);

		await query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1
					FROM pg_constraint
					WHERE conname = 'fk_ai_test_created_by_user'
				) THEN
					ALTER TABLE ai_test
					ADD CONSTRAINT fk_ai_test_created_by_user
					FOREIGN KEY (created_by_user_id) REFERENCES app_user(id)
					ON DELETE SET NULL;
				END IF;
			END
			$$
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
			CREATE INDEX IF NOT EXISTS idx_api_request_events_route_time
			ON api_request_events (route, created_at DESC)
		`);
	})().catch((error) => {
		schemaReadyPromise = null;
		throw error;
	});

	return schemaReadyPromise;
}

export async function createTestRecord(
	test,
	requestParams = {},
	options = {},
) {
	await ensureStorageSchema();

	const topic = test?.topic || requestParams.topic || null;
	const testType = requestParams.testType || null;
	const difficulty = requestParams.difficulty || null;
	const language = requestParams.language || null;
	const createdByUserId = normalizeUserId(options.createdByUserId);
	const testMode = requestParams.testMode || null;
	const examId = normalizeExamId(requestParams.examId);
	const objectiveOnly =
		typeof requestParams.objectiveOnly === 'boolean'
			? requestParams.objectiveOnly
			: null;
	const durationMinutes = Number.isFinite(Number(requestParams.durationMinutes))
		? Number(requestParams.durationMinutes)
		: null;
	const numQuestions =
		Number.isInteger(requestParams.numQuestions)
			? requestParams.numQuestions
			: Array.isArray(test?.questions)
				? test.questions.length
				: null;

	const result = await query(
		`INSERT INTO ai_test
		 (test, topic, test_type, difficulty, language, num_questions, created_by_user_id, test_mode, exam_id, objective_only, duration_minutes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id`,
		[
			JSON.stringify(test),
			topic,
			testType,
			difficulty,
			language,
			numQuestions,
			createdByUserId,
			testMode,
			examId,
			objectiveOnly,
			durationMinutes,
		],
	);

	return result.rows[0]?.id;
}

export async function getTestRecordById(id) {
	await ensureStorageSchema();

	const result = await query(
		`SELECT
			id,
			test,
			created_at,
			topic,
			test_type,
			difficulty,
			language,
			num_questions,
			created_by_user_id
		 FROM ai_test
		 WHERE id = $1`,
		[id],
	);

	return result.rows[0] || null;
}

export async function findReusableFullExamRecord({
	examId,
	language,
	userId,
	excludedTestIds = [],
}) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	const normalizedExamId = normalizeExamId(examId);
	const normalizedLanguage =
		typeof language === 'string' && language.trim()
			? language.trim().toLowerCase()
			: null;
	const normalizedExcludedTestIds = Array.isArray(excludedTestIds)
		? excludedTestIds
				.map((value) => Number(value))
				.filter((value) => Number.isInteger(value) && value > 0)
		: [];

	if (!normalizedUserId || !normalizedExamId || !normalizedLanguage) {
		return null;
	}

	const result = await query(
		`SELECT
			t.id,
			t.test,
			t.created_at,
			t.topic,
			t.test_type,
			t.difficulty,
			t.language,
			t.num_questions,
			t.created_by_user_id
		 FROM ai_test t
		 LEFT JOIN app_user_test_attempt a
			ON a.test_id = t.id AND a.user_id = $2
		 WHERE
			a.id IS NULL
			AND COALESCE(t.language, LOWER(t.test->'requestParams'->>'language'), 'english') = $3
			AND (
				(t.test_mode = 'full-exam' AND t.exam_id = $1)
				OR (
					COALESCE(t.test->'requestParams'->>'testMode', '') = 'full-exam'
					AND COALESCE(t.test->'requestParams'->>'examId', '') = $1
				)
			)
			AND NOT (t.id = ANY($4::bigint[]))
			AND jsonb_array_length(
				CASE
					WHEN jsonb_typeof(t.test->'questions') = 'array'
						THEN t.test->'questions'
					ELSE '[]'::jsonb
				END
			) > 0
		 ORDER BY t.created_at DESC
		 LIMIT 1`,
		[
			normalizedExamId,
			normalizedUserId,
			normalizedLanguage,
			normalizedExcludedTestIds,
		],
	);

	return result.rows[0] || null;
}

export async function listTestRecords({
	search = '',
	limit = 10,
	createdByUserId = null,
	language = 'all',
	examType = 'all',
} = {}) {
	await ensureStorageSchema();

	const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
	const trimmedSearch = search.trim();
	const normalizedUserId = normalizeUserId(createdByUserId);
	const hasUserScope = normalizedUserId !== null;
	const normalizedLanguage = String(language || '')
		.trim()
		.toLowerCase();
	const normalizedExamType = String(examType || '')
		.trim()
		.toLowerCase();
	const hasLanguageFilter = ['english', 'hindi'].includes(normalizedLanguage);
	const hasExamTypeFilter = ['full-exam', 'quiz-practice'].includes(
		normalizedExamType,
	);

	const whereClauses = [];
	const queryParams = [];

	if (hasUserScope) {
		queryParams.push(normalizedUserId);
		whereClauses.push(`created_by_user_id = $${queryParams.length}`);
	}

	if (trimmedSearch) {
		queryParams.push(`%${trimmedSearch}%`);
		whereClauses.push(
			`COALESCE(topic, test->>'topic', '') ILIKE $${queryParams.length}`,
		);
	}

	if (hasLanguageFilter) {
		queryParams.push(normalizedLanguage);
		whereClauses.push(
			`LOWER(COALESCE(language, test->'requestParams'->>'language', 'english')) = $${queryParams.length}`,
		);
	}

	if (hasExamTypeFilter) {
		queryParams.push(normalizedExamType);
		whereClauses.push(
			`LOWER(COALESCE(test_mode, test->'requestParams'->>'testMode', 'quiz-practice')) = $${queryParams.length}`,
		);
	}

	queryParams.push(cappedLimit);
	const whereSql =
		whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

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
		 ORDER BY created_at DESC
		 LIMIT $${queryParams.length}`,
		queryParams,
	);

	return result.rows;
}

function sanitizeStorageMap(storage) {
	if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
		return {};
	}

	const sanitized = {};
	const entries = Object.entries(storage).slice(0, 400);
	for (const [key, value] of entries) {
		if (typeof key !== 'string' || key.length === 0 || key.length > 200) {
			continue;
		}

		if (value === null || value === undefined) {
			continue;
		}

		if (typeof value === 'string') {
			sanitized[key] = value;
			continue;
		}

		try {
			sanitized[key] = JSON.stringify(value);
		} catch {
			// Skip non-serializable values.
		}
	}

	return sanitized;
}

function sanitizeAttempt(attempt) {
	if (!attempt || typeof attempt !== 'object') {
		return null;
	}

	const testId = Number(attempt.testId);
	if (!Number.isInteger(testId) || testId <= 0) {
		return null;
	}

	const userAnswers =
		attempt.userAnswers && typeof attempt.userAnswers === 'object'
			? attempt.userAnswers
			: {};
	const score = Number.isFinite(Number(attempt.score))
		? Number(attempt.score)
		: null;
	const totalQuestions = Number.isFinite(Number(attempt.totalQuestions))
		? Number(attempt.totalQuestions)
		: null;
	const timeTaken = Number.isFinite(Number(attempt.timeTaken))
		? Number(attempt.timeTaken)
		: null;
	const submittedAt =
		attempt.submittedAt && !Number.isNaN(new Date(attempt.submittedAt).getTime())
			? new Date(attempt.submittedAt)
			: new Date();
	const metadata =
		attempt.metadata && typeof attempt.metadata === 'object'
			? attempt.metadata
			: {};

	return {
		testId,
		userAnswers,
		score,
		totalQuestions,
		timeTaken,
		submittedAt,
		metadata,
	};
}

export async function upsertUserStorageState(userId, storage = {}) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) {
		throw new Error('Invalid user id for storage sync');
	}

	const sanitizedStorage = sanitizeStorageMap(storage);
	const result = await query(
		`INSERT INTO app_user_state (user_id, storage, updated_at)
		 VALUES ($1, $2::jsonb, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET
			storage = EXCLUDED.storage,
			updated_at = NOW()
		 RETURNING storage, updated_at`,
		[normalizedUserId, JSON.stringify(sanitizedStorage)],
	);

	return result.rows[0] || { storage: sanitizedStorage };
}

export async function getUserStorageState(userId) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) {
		return {};
	}

	const result = await query(
		`SELECT storage
		 FROM app_user_state
		 WHERE user_id = $1`,
		[normalizedUserId],
	);

	return result.rows[0]?.storage || {};
}

export async function upsertUserTestAttempt(userId, attempt) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) {
		throw new Error('Invalid user id for attempt sync');
	}

	const sanitizedAttempt = sanitizeAttempt(attempt);
	if (!sanitizedAttempt) {
		return null;
	}

	const result = await query(
		`INSERT INTO app_user_test_attempt
		 (user_id, test_id, user_answers, score, total_questions, time_taken, submitted_at, metadata, updated_at)
		 VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, NOW())
		 ON CONFLICT (user_id, test_id)
		 DO UPDATE SET
			user_answers = CASE
				WHEN EXCLUDED.submitted_at >= app_user_test_attempt.submitted_at
					THEN EXCLUDED.user_answers
				ELSE app_user_test_attempt.user_answers
			END,
			score = CASE
				WHEN EXCLUDED.submitted_at >= app_user_test_attempt.submitted_at
					THEN EXCLUDED.score
				ELSE app_user_test_attempt.score
			END,
			total_questions = CASE
				WHEN EXCLUDED.submitted_at >= app_user_test_attempt.submitted_at
					THEN EXCLUDED.total_questions
				ELSE app_user_test_attempt.total_questions
			END,
			time_taken = CASE
				WHEN EXCLUDED.submitted_at >= app_user_test_attempt.submitted_at
					THEN EXCLUDED.time_taken
				ELSE app_user_test_attempt.time_taken
			END,
			submitted_at = GREATEST(app_user_test_attempt.submitted_at, EXCLUDED.submitted_at),
			metadata = app_user_test_attempt.metadata || EXCLUDED.metadata,
			updated_at = NOW()
		 RETURNING test_id, score, total_questions, time_taken, submitted_at`,
		[
			normalizedUserId,
			sanitizedAttempt.testId,
			JSON.stringify(sanitizedAttempt.userAnswers || {}),
			sanitizedAttempt.score,
			sanitizedAttempt.totalQuestions,
			sanitizedAttempt.timeTaken,
			sanitizedAttempt.submittedAt.toISOString(),
			JSON.stringify(sanitizedAttempt.metadata || {}),
		],
	);

	return result.rows[0] || null;
}

export async function upsertUserTestAttempts(userId, attempts = []) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId || !Array.isArray(attempts) || attempts.length === 0) {
		return [];
	}

	const deduped = new Map();
	for (const attempt of attempts) {
		const sanitizedAttempt = sanitizeAttempt(attempt);
		if (!sanitizedAttempt) {
			continue;
		}

		const existing = deduped.get(sanitizedAttempt.testId);
		if (!existing || sanitizedAttempt.submittedAt > existing.submittedAt) {
			deduped.set(sanitizedAttempt.testId, sanitizedAttempt);
		}
	}

	const results = [];
	for (const sanitizedAttempt of deduped.values()) {
		const savedAttempt = await upsertUserTestAttempt(normalizedUserId, sanitizedAttempt);
		if (savedAttempt) {
			results.push(savedAttempt);
		}
	}

	return results;
}

export async function getUserTestAttemptByTestId(userId, testId) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	const normalizedTestId = Number(testId);
	if (
		!normalizedUserId ||
		!Number.isInteger(normalizedTestId) ||
		normalizedTestId <= 0
	) {
		return null;
	}

	const result = await query(
		`SELECT
			test_id,
			user_answers,
			score,
			total_questions,
			time_taken,
			submitted_at,
			metadata
		 FROM app_user_test_attempt
		 WHERE user_id = $1 AND test_id = $2
		 LIMIT 1`,
		[normalizedUserId, normalizedTestId],
	);

	return result.rows[0] || null;
}

export async function listUserTestAttemptsWithTests(userId, { limit = 120 } = {}) {
	await ensureStorageSchema();

	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) {
		return [];
	}

	const cappedLimit = Math.min(Math.max(Number(limit) || 120, 1), 300);
	const result = await query(
		`SELECT
			a.test_id,
			a.user_answers,
			a.score,
			a.total_questions,
			a.time_taken,
			a.submitted_at,
			a.metadata,
			t.test,
			t.created_at
		 FROM app_user_test_attempt a
		 INNER JOIN ai_test t ON t.id = a.test_id
		 WHERE a.user_id = $1
		 ORDER BY a.submitted_at DESC
		 LIMIT $2`,
		[normalizedUserId, cappedLimit],
	);

	return result.rows;
}

export async function logApiEvent({
	route,
	action = null,
	clientKey = null,
	statusCode = null,
	durationMs = null,
	errorMessage = null,
	metadata = {},
}) {
	try {
		await ensureStorageSchema();
		await query(
			`INSERT INTO api_request_events
			 (route, action, client_key, status_code, duration_ms, error_message, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
			[
				route,
				action,
				clientKey,
				statusCode,
				durationMs,
				errorMessage,
				JSON.stringify(metadata || {}),
			],
		);
	} catch (error) {
		console.error('Failed to log API event:', error);
	}
}

export async function cleanupOldRateLimitEvents() {
	await ensureStorageSchema();
	await query(
		`DELETE FROM api_rate_limit_events
		 WHERE created_at < NOW() - INTERVAL '2 days'`,
	);
}
