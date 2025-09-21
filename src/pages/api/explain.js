import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../../lib/rateLimiter';
import { generateExplanationPrompt } from '../../lib/prompt';

export async function POST({ request, clientAddress }) {
	try {
		// Check rate limit
        const requestWithIP = new Request(request, { headers: { 'x-forwarded-for': clientAddress } });
		const rateLimit = await rateLimiter(requestWithIP);
		if (rateLimit.limited) {
			return new Response(JSON.stringify({
					error: 'Rate limit exceeded. Please try again later.',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				}), {
					status: 429,
					headers: {
						'X-RateLimit-Limit': '10',
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				},
			);
		}

		const { topic, question, answer, language } = await request.json();
		const apiKey = import.meta.env.GEMINI_API_KEY;

		if (!topic || !question || !answer) {
			return new Response(JSON.stringify({ error: 'Topic, question, and answer are required' }), { status: 400 });
		}

		if (!apiKey) {
			return new Response(JSON.stringify({ error: 'Gemini API key is not configured' }), { status: 500 });
		}

		const ai = new GoogleGenAI(apiKey);

		const prompt = generateExplanationPrompt({
			topic,
			question,
			answer,
			language,
		});

		const response = await ai.models.generateContent({
			model: 'gemini-2.5-flash',
			contents: prompt,
			config: { responseMimeType: 'application/json' },
		});
		const questionPaper = JSON.parse(response.text);
		return new Response(JSON.stringify(questionPaper));
	} catch (error) {
		console.error(error);
		return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), { status: 500 });
	}
}
