import { Pool } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { env } from '$env/dynamic/private';

let poolInstance = null;
let schemaReadyPromise = null;

function normalizeExamId(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
}

function getPool() {
	if (!poolInstance) {
		const connectionString = env.DATABASE_URL;
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
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS test_mode TEXT`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS exam_id TEXT`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS objective_only BOOLEAN`);
			await query(`ALTER TABLE ai_test ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);

			await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_created_at
				ON ai_test (created_at DESC)
			`);
			await query(`
				CREATE INDEX IF NOT EXISTS idx_ai_test_exam_lookup
				ON ai_test (test_mode, exam_id, language, created_at DESC)
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

export async function createTestRecord(test, requestParams = {}) {
	await ensureStorageSchema();

	const topic = test?.topic || requestParams.topic || null;
	const testType = requestParams.testType || null;
	const difficulty = requestParams.difficulty || null;
	const language = requestParams.language || null;
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
		 (test, topic, test_type, difficulty, language, num_questions, test_mode, exam_id, objective_only, duration_minutes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
			num_questions
		 FROM ai_test
		 WHERE id = $1`,
		[id],
	);

	return result.rows[0] || null;
}

export async function findReusableFullExamRecord({
	examId,
	language,
	excludedTestIds = [],
}) {
	await ensureStorageSchema();

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

	if (!normalizedExamId || !normalizedLanguage) {
		return null;
	}

	const queryParams = [normalizedExamId];
	const whereClauses = [];

	queryParams.push(normalizedLanguage);
	whereClauses.push(
		`COALESCE(t.language, LOWER(t.test->'requestParams'->>'language'), 'english') = $${queryParams.length}`,
	);
	whereClauses.push(
		`(
			(t.test_mode = 'full-exam' AND t.exam_id = $1)
			OR (
				COALESCE(t.test->'requestParams'->>'testMode', '') = 'full-exam'
				AND COALESCE(t.test->'requestParams'->>'examId', '') = $1
			)
		)`,
	);
	queryParams.push(normalizedExcludedTestIds);
	whereClauses.push(`NOT (t.id = ANY($${queryParams.length}::bigint[]))`);
	whereClauses.push(
		`jsonb_array_length(
			CASE
				WHEN jsonb_typeof(t.test->'questions') = 'array'
					THEN t.test->'questions'
				ELSE '[]'::jsonb
			END
		) > 0`,
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
		queryParams,
	);

	return result.rows[0] || null;
}

export async function listTestRecords({
	search = '',
	limit = 10,
	language = 'all',
	examType = 'all',
} = {}) {
	await ensureStorageSchema();

	const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
	const trimmedSearch = search.trim();
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
