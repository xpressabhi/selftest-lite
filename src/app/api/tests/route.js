import { NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

// Initialize database pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get('id');

		if (!id) {
			return NextResponse.json(
				{ error: 'ID parameter is required' },
				{ status: 400 },
			);
		}

		const client = await pool.connect();
		try {
			// Query the database for the test with the given ID
			const result = await client.query('SELECT * FROM ai_test WHERE id = $1', [
				id,
			]);

			if (result.rows.length === 0) {
				return NextResponse.json({ error: 'Test not found' }, { status: 404 });
			}

			return NextResponse.json(result.rows[0]);
		} finally {
			client.release();
		}
	} catch (error) {
		console.error('Database error:', error);
		return NextResponse.json(
			{ error: 'An error occurred while fetching the test' },
			{ status: 500 },
		);
	}
}

export async function POST(request) {
	try {
		const { test } = await request.json();

		if (!test) {
			return NextResponse.json(
				{ error: 'Test data is required' },
				{ status: 400 },
			);
		}

		const client = await pool.connect();
		try {
			// Insert the test into the database
			const result = await client.query(
				'INSERT INTO ai_test (test) VALUES ($1) RETURNING id',
				[JSON.stringify(test)],
			);

			// Return the newly created test ID
			return NextResponse.json({
				message: 'Test created successfully',
				id: result.rows[0].id,
			});
		} finally {
			client.release();
		}
	} catch (error) {
		console.error('Database error:', error);
		return NextResponse.json(
			{ error: 'An error occurred while creating the test' },
			{ status: 500 },
		);
	}
}
