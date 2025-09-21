import { Pool } from '@neondatabase/serverless';

// Initialize database pool
const pool = new Pool({ connectionString: import.meta.env.DATABASE_URL });

export async function GET({ request }) {
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get('id');

		if (!id) {
			return new Response(JSON.stringify({ error: 'ID parameter is required' }), { status: 400 });
		}

		const client = await pool.connect();
		try {
			// Query the database for the test with the given ID
			const result = await client.query('SELECT * FROM ai_test WHERE id = $1', [
				id,
			]);

			if (result.rows.length === 0) {
				return new Response(JSON.stringify({ error: 'Test not found' }), { status: 404 });
			}

			return new Response(JSON.stringify(result.rows[0]));
		} finally {
			client.release();
		}
	} catch (error) {
		console.error('Database error:', error);
		return new Response(JSON.stringify({ error: 'An error occurred while fetching the test' }), { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const { test } = await request.json();

		if (!test) {
			return new Response(JSON.stringify({ error: 'Test data is required' }), { status: 400 });
		}

		const client = await pool.connect();
		try {
			// Insert the test into the database
			const result = await client.query(
				'INSERT INTO ai_test (test) VALUES ($1) RETURNING id',
				[JSON.stringify(test)],
			);

			// Return the newly created test ID
			return new Response(JSON.stringify({
				message: 'Test created successfully',
				id: result.rows[0].id,
			}));
		} finally {
			client.release();
		}
	} catch (error) {
		console.error('Database error:', error);
		return new Response(JSON.stringify({ error: 'An error occurred while creating the test' }), { status: 500 });
	}
}
