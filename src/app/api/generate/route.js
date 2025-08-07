import { NextResponse } from 'next/server';

import { GoogleGenAI } from '@google/genai';

export async function POST(request) {
	try {
		const { topic } = await request.json();
		const apiKey = process.env.GEMINI_API_KEY;

		if (!topic) {
			return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
		}

		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI(apiKey);

		const prompt = `
      Please generate a multiple-choice quiz based on the following description:
      ---
      ${topic}
      ---
      Provide the output in a JSON format with the following structure:
      {
        "topic": "A suitable topic based on the description",
        "questions": [
          {
            "question": "...",
            "options": ["...", "...", "...", "..."],
            "answer": "..."
          }
        ]
      }
      The "answer" must be one of the strings from the "options" array.
      Do not include any text outside of the JSON object.
    `;

		const response = await ai.models.generateContent({
			model: 'gemini-2.0-flash-001',
			contents: prompt,
		});
		const questionPaper = JSON.parse(response.text);
		return NextResponse.json(questionPaper);
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: 'An unexpected error occurred' },
			{ status: 500 },
		);
	}
}
