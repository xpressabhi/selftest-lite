import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';

export async function POST(request) {
	try {
		// Check rate limit
		const rateLimit = await rateLimiter(request);
		if (rateLimit.limited) {
			return NextResponse.json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': '10',
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				},
			);
		}

		const { topic, question, answer } = await request.json();
		const apiKey = process.env.GEMINI_API_KEY;

		if (!topic || !question || !answer) {
			return NextResponse.json(
				{ error: 'Topic, question, and answer are required' },
				{ status: 400 },
			);
		}

		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI(apiKey);

		const prompt = `
      Please generate accurate explanantion to show why this answer is correct.
      ${topic} is the topic of the question.
      Question: ${question}
      Answer: ${answer}

      Provide the output in a JSON format with the following structure:
      {
        "explanation": "Detailed explanation of why the answer is correct"
	  }

	  IMPORTANT EXPLANATION INSTRUCTIONS: Ensure the explanation is comprehensive, clear, and educational. Please provide a comprehensive explanation in the same language as the question, within 200 words that includes (optional):
                1. Validation of the question and its options
                2. Analysis of the user's answer (correct/incorrect)
                3. Detailed explanation of the correct answer with underlying concepts
                4. Step-by-step solution process (especially for numerical problems)
                5. Common misconceptions related to this topic
                6. Relevant formulas and their applications
                7. Real-world applications or examples
                Use appropriate formatting (bold, italic, lists) for better readability.
                For numerical questions, show all calculations with proper units and significant figures.

      IMPORTANT FORMATTING INSTRUCTIONS:
      1. Use Markdown formatting for all text in questions and options:
         - **Bold text** for emphasis
         - *Italic text* for definitions or terms
         - ~~Strikethrough~~ when needed
         - > Blockquotes for important notes
         - Bullet lists with * or - when appropriate
         - Numbered lists with 1., 2., etc. when sequence matters

      2. For mathematical expressions, use LaTeX syntax:
         - Inline math with $...$ (e.g., $E = mc^2$)
         - Block math with $$...$$
         - Examples: $\frac{a}{b}$, $\sqrt{x}$, $\sum_{i=1}^{n}$

      3. For chemical formulas:
         - Use proper subscripts and superscripts: H₂O, CO₂
         - For complex formulas, use LaTeX: $H_2SO_4$, $Fe^{2+}$

      4. For physics symbols:
         - Use Unicode characters when possible: Ω, μ, λ, θ
         - For complex expressions, use LaTeX: $\Delta G = \Delta H - T\Delta S$

      5. For code snippets, use code blocks with language specification:
         Use triple backticks followed by the language name, then the code, then triple backticks again.
         For example, a Python code block would look like this (but with backticks instead of quotes):
         """python
         def example():
             return True
         """
      
      The "answer" must be one of the strings from the "options" array.
      Do not include any text outside of the JSON object.
    `;

		const response = await ai.models.generateContent({
			model: 'gemini-2.5-flash-lite',
			contents: prompt,
			config: { responseMimeType: 'application/json' },
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
