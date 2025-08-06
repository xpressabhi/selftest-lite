import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { topic, apiKey } = await request.json();

    if (!topic || !apiKey) {
      return NextResponse.json({ error: 'Topic and API key are required' }, { status: 400 });
    }

    const prompt = `
      Please generate a multiple-choice quiz on the topic "${topic}".
      The quiz should have 10 questions.
      Each question should have 4 options.
      Provide the output in a JSON format with the following structure:
      {
        "topic": "${topic}",
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ error: errorData.error.message || 'An error occurred while generating the test.' }, { status: response.status });
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    // Clean the response to ensure it's valid JSON
    const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const questionPaper = JSON.parse(jsonText);

    return NextResponse.json(questionPaper);

  } catch (error) {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
