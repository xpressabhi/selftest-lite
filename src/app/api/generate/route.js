import { NextResponse } from 'next/server';

import { GoogleGenAI } from '@google/genai';

export async function POST(request) {
	try {
		const { topic, previousTests = [] } = await request.json();
		const apiKey = process.env.GEMINI_API_KEY;

		if (!topic) {
			return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
		}

		// Extract all previous questions to help AI avoid duplicates
		const previousQuestions = previousTests.flatMap(
			(test) =>
				test.questions?.map((q) => ({
					question: q.question,
					answer: q.answer,
				})) || [],
		);

		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI(apiKey);

		const prompt = `
      Please generate a practical, implementation-focused multiple-choice quiz with 10 questions based on the following description (unless a specific number of questions is mentioned in the description, in which case follow that instruction).
      
      IMPORTANT GUIDELINES:
      1. Focus on real-world applications and problem-solving scenarios
      2. Include numerical problems that require calculations
      3. For programming topics, focus on actual coding challenges and debugging scenarios
      4. For science topics, emphasize practical experiments and real-world phenomena
      5. For math topics, focus on applied problems in engineering, finance, or data analysis
      6. Include data interpretation, graph analysis, and practical measurements where relevant
      7. Avoid purely theoretical or definition-based questions
      8. Each question should demonstrate a practical use case or implementation
      
      IMPORTANT: Generate questions that are different from the previously asked questions listed below.
      
      Topic:
      ---
      ${topic}
      ---

      Previously asked questions (AVOID generating similar questions):
      ${
				previousQuestions.length > 0
					? '---\n' +
					  previousQuestions
							.map((q) => `Q: ${q.question}\nA: ${q.answer}`)
							.join('\n\n') +
					  '\n---'
					: 'No previous questions.'
			}
      Provide the output in a JSON format with the following structure:
      {
        "topic": "A suitable topic based on the description",
        "questions": [
          {
            "question": "Question text with formatting",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "Correct option text"
          }
          // More questions should follow this pattern
        ]
      }
      
      IMPORTANT: Generate 10 questions total by default (or as specified in the description).

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
