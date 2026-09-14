export function generatePrompt({
	topic,
	numQuestions,
	difficulty,
	testType,
	topicContext,
	examName,
	syllabusFocus = [],
	previousQuestions,
	language,
	testMode = 'quiz-practice',
	objectiveOnly = false,
	userContext = null,
	warmUpDifficulty = null,
}) {
	return `You are an expert quiz generator. Generate a ${difficulty}-level ${testType} quiz with ${numQuestions} questions.
    
    LANGUAGE: ${language || 'English'}
    TEST MODE: ${testMode}
    EXAM MODE: ${
		examName
			? `Generate this as an India exam-style paper for ${examName}.`
			: 'General quiz mode'
	}
    OBJECTIVE ONLY: ${objectiveOnly ? 'Yes' : 'No'}
    SYLLABUS COVERAGE: ${
		syllabusFocus.length > 0 ? syllabusFocus.join(', ') : 'Use the full provided topic context'
	}
    
    OUTPUT FORMAT:
    The response must be a valid JSON object with this exact structure:
    {
      "topic": "A clear topic description",
      "questions": [
        {
          "question": "Question text with formatting",
          "rationale": "Private reasoning: why the key is right and the closest distractor is wrong",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": "Must match exactly one of the options"
        }
      ]
    }

    For every question, decide the correct answer first, then write the rationale, then build the options around it.
    
    IMPORTANT RULES:
    1. Response must be ONLY the JSON object - no other text
    2. Use double quotes for all strings
    3. Multiple choice questions must have exactly 4 options
    4. True/False questions must have exactly 2 options using localized equivalents of true/false
    5. Copy each answer exactly from one complete option string, character-for-character. Never output a label (A/B), a combination (both A and B), or any prefix in the answer field
    6. Questions must match the specified difficulty level
    7. Do not repeat previous questions
    8. ${
		examName
			? `Match the tone and rigor expected in ${examName} objective practice papers.`
			: 'Keep questions practical and realistic.'
	}
    9. ${
		testMode === 'full-exam'
			? 'Generate a full-length exam paper style output for objective testing.'
			: 'Generate a concise quiz-practice style output.'
	}
    10. Do not include explanation fields for questions. Explanations are generated later on demand.
    11. Before returning, verify that every answer is exactly equal to one of its options.
    12. For each question, work out the correct answer first, then write the rationale, then build the distractors around it.
    13. Distractors must be plausible and educational: common misconceptions, same category and difficulty as the key. Never use "all of the above", "none of the above", joke options, or obviously wrong options.
    14. OPTION LENGTH BALANCE (automatically checked): keep all four options within about 20% of each other in character length. The correct option must never be the longest option. If the correct answer needs extra words, give the distractors the same level of detail instead of padding the key. Example - BAD: key "Oxidation of primary alcohols with acidified potassium dichromate" vs distractors "Reduction", "Hydration", "Substitution". GOOD: key "Oxidation of primary alcohols" vs distractors "Reduction of aldehydes", "Hydration of alkenes", "Substitution of alkanes".
    15. Exactly one option must be defensible. Never include two near-synonyms, two facts that are both true, or an option that is correct under a different interpretation.
    16. Match the requested language and script: a Hindi paper uses Devanagari for question and options (standard English technical terms are allowed).
    17. FINAL LENGTH CHECK: before returning, compare the character length of the correct option with the longest distractor for every question. If the correct option is longer, rewrite that question's options until it is not.
    
    CONTENT FORMATTING:
    For code questions (especially when testType is 'coding'):
    - Use properly formatted code blocks with language specification
    - Maintain correct code indentation
    - Include practical scenarios and common bugs
    - Example: When asking about a function bug, show the incorrect code
    - For JavaScript/TypeScript: Include real-world DOM, React, or Node.js scenarios
    - For Python: Include data structure manipulation and algorithm challenges
    
    For all questions:
    - Use **bold** for emphasis
    - Use *italic* for terms
    - Use LaTeX for math: $x^2$
    - When LaTeX appears inside JSON strings, escape its backslashes so commands survive JSON parsing (for example, output $2NaHCO_3 \\\\rightarrow Na_2CO_3$ in the JSON source)
    - Every LaTeX expression must be valid KaTeX. Group multi-character superscripts and function arguments, for example use $x^{\\ln x}$ rather than $x^\\ln x$.
    - Do not output malformed or unclosed LaTeX delimiters; use plain Unicode symbols when a formula is not needed.
    - Use proper symbols: °C, km², π
    
    TOPIC INFORMATION:
    ${topicContext}
    
    ${
		userContext
			? `USER CONTEXT (personalized, keep private):
    ${userContext}
    `
			: ''
	}
    
          LANGUAGE INSTRUCTIONS:
          - If the subject itself is a language (e.g., Hindi, English, French), generate the paper in that language.
          - If the user specifies "Hindi medium" (or any other medium), generate the entire quiz in that medium language, regardless of the subject.
          - Otherwise, default to English unless the topic context clearly indicates another language.
    
          Quiz Type Instructions:
          ${
				testType === 'multiple-choice'
					? `
          - Create challenging multiple-choice questions with 4 options each
          - Ensure distractors (wrong options) are plausible and educational
          - Include practical, real-world scenarios when possible
          - For code questions, show short code snippets in proper format`
					: testType === 'true-false'
						? `
          - Create nuanced true/false statements that test deep understanding
          - Use exactly 2 options with localized true/false wording in the selected language
          - Include some slightly tricky but fair statements
          - Focus on common misconceptions and important concepts
          - For code, present statements about code behavior or best practices`
						: testType === 'coding'
							? `
          - Create practical coding problems using proper code block formatting
          - Include a mix of:
            * Debug and fix broken code
            * Complete partial implementations
            * Optimize inefficient code
            * Fix security or performance issues
          - Focus on real-world programming scenarios
          - Show expected inputs/outputs for clarity`
							: testType === 'speed-challenge'
								? `
          - Create fast-response multiple-choice questions with exactly 4 options
          - Keep question stems concise and direct while preserving difficulty
          - Favor practical recall and quick reasoning over long derivations
          - Ensure wrong options are plausible but clearly distinguishable`
								: `
          - Mix different question types for comprehensive assessment
          - Include properly formatted code examples where relevant
          - Balance theoretical concepts with practical application
          - Use appropriate formatting for each question type`
			}      Difficulty Level (${difficulty}):
          ${
				difficulty === 'beginner'
					? `
          - Focus on fundamental concepts and basic understanding
          - Use simple, clear language and straightforward scenarios
          - Include some easy wins to build confidence`
					: difficulty === 'intermediate'
						? `
          - Mix basic and advanced concepts
          - Include some challenging but fair questions
          - Test practical application of knowledge`
						: difficulty === 'advanced'
							? `
          - Focus on complex scenarios and edge cases
          - Test deep understanding and problem-solving skills
          - Include challenging real-world applications`
							: `
          - Include expert-level concepts and advanced scenarios
          - Test mastery of the subject matter
          - Focus on optimization, best practices, and intricate details`
			}
      ${
			warmUpDifficulty
				? `WARM-UP GRADIENT:
          - The first approximately 20% of the questions must be a gentle warm-up at ${warmUpDifficulty} level (fundamental, quick wins).
          - The remaining ~80% must be at ${difficulty} level.
          - Keep the total question count exact; make the transition gradual rather than abrupt.
          `
				: ''
		}
          
          IMPORTANT GUIDELINES:
          1. Focus on real-world applications and problem-solving scenarios
          2. Include numerical problems that require calculations
          3. For programming topics, focus on actual coding challenges and debugging scenarios
          4. For science topics, emphasize practical experiments and real-world phenomena
          5. For math topics, focus on applied problems in engineering, finance, or data analysis
          6. Include data interpretation, graph analysis, and practical measurements where relevant
          7. Avoid purely theoretical or definition-based questions
          8. Each question should demonstrate a practical use case or implementation
          9. ${
				examName
					? `Ensure coverage is balanced across selected syllabus units for ${examName}.`
					: 'Ensure broad coverage across selected context.'
			}
          
          IMPORTANT: Generate questions that are different from the previously asked questions listed below.
          
          Topic (generate questions ONLY about this topic; never substitute any other subject, language, or topic):
          ---
          ${topic}
          ---
    
          PREVIOUS QUESTIONS TO AVOID:
          ${
				previousQuestions.length > 0
					? previousQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')
					: 'No previous questions.'
			}
          FORMATTING GUIDELINES:
          - Use markdown for emphasis (**bold**, *italic*)
          - Use LaTeX for math ($E = mc^2$)
          - Use triple backticks for code blocks
          - Use proper unicode for symbols (Ω, μ, λ, θ)
          - Use LaTeX for complex formulas ($H_2SO_4$)
          
          Note: The question count, option count, language, difficulty, and JSON validity are checked automatically after generation, so focus your effort on factual accuracy, a single defensible answer, and plausible distractors.

          Remember: Must Provide ONLY the VALID JSON response.
          Do not include any text outside of the JSON object.
          Do not include explanation fields in question objects.
        `;
}

export function generateExplanationPrompt({ topic, question, answer, language }) {
	return `
      Generate an accurate explanation for why the answer is correct.

      Topic: ${topic}
      Explanation Language: ${language || 'English'}
      Question: ${question}
      Correct Answer: ${answer}

      Output must be a JSON object with this exact structure:
      {
        "explanation": "Markdown explanation text"
      }

      EXPLANATION REQUIREMENTS:
      1. Write in the same language as the question (${language || 'English'}).
      2. Keep it educational and concise (ideally under 220 words).
      3. Clearly explain why the correct answer is right.
      4. Add one concrete illustrative example.
      5. Include a separate line in the explanation starting with "**Example:**".
      6. Use Markdown formatting where useful (lists, bold, inline LaTeX, short code block if needed).
      7. Do not include extra keys or any text outside the JSON object.
    `;
}
