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
            "question": "Question text with formatting",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "Correct option text"
          }
        ]
      }

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
			model: 'gemini-2.0-flash-001',
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
