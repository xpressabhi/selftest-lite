import { Pool } from '@neondatabase/serverless';
import { createHash } from 'crypto';

let poolInstance = null;
let schemaReadyPromise = null;

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

		await query(`
			CREATE INDEX IF NOT EXISTS idx_ai_test_created_at
			ON ai_test (created_at DESC)
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
	const numQuestions =
		Number.isInteger(requestParams.numQuestions)
			? requestParams.numQuestions
			: Array.isArray(test?.questions)
				? test.questions.length
				: null;

	const result = await query(
		`INSERT INTO ai_test (test, topic, test_type, difficulty, language, num_questions)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		[JSON.stringify(test), topic, testType, difficulty, language, numQuestions],
	);

	return result.rows[0]?.id;
}

export async function getTestRecordById(id) {
	await ensureStorageSchema();

	const result = await query(
		`SELECT id, test, created_at, topic, test_type, difficulty, language, num_questions
		 FROM ai_test
		 WHERE id = $1`,
		[id],
	);

	return result.rows[0] || null;
}

export async function listTestRecords({ search = '', limit = 10 } = {}) {
	await ensureStorageSchema();

	const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
	const trimmedSearch = search.trim();

	if (!trimmedSearch) {
		const result = await query(
			`SELECT
				id,
				COALESCE(topic, test->>'topic', 'Untitled test') AS topic,
				test_type,
				difficulty,
				language,
				num_questions,
				created_at
			 FROM ai_test
			 ORDER BY created_at DESC
			 LIMIT $1`,
			[cappedLimit],
		);
		return result.rows;
	}

	const searchPattern = `%${trimmedSearch}%`;
	const result = await query(
		`SELECT
			id,
			COALESCE(topic, test->>'topic', 'Untitled test') AS topic,
			test_type,
			difficulty,
			language,
			num_questions,
			created_at
		 FROM ai_test
		 WHERE
			COALESCE(topic, test->>'topic', '') ILIKE $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		[searchPattern, cappedLimit],
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
