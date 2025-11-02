export function generatePrompt({
	topic,
	numQuestions,
	difficulty,
	testType,
	topicContext,
	previousQuestions,
	language,
}) {
	return `You are an expert quiz generator. Generate a ${difficulty}-level ${testType} quiz with ${numQuestions} questions.
    
    LANGUAGE: ${language || 'English'}
    
    OUTPUT FORMAT:
    The response must be a valid JSON object with this exact structure:
    {
      "topic": "A clear topic description",
      "questions": [
        {
          "question": "Question text with formatting",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": "Must match exactly one of the options"
        }
      ]
    }
    
    IMPORTANT RULES:
    1. Response must be ONLY the JSON object - no other text
    2. Use double quotes for all strings
    3. Multiple choice questions must have exactly 4 options
    4. True/False questions use exactly ["True", "False"] as options
    5. Each answer must match exactly one of the options
    6. Questions must match the specified difficulty level
    7. Do not repeat previous questions
    
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
    - Use proper symbols: °C, km², π
    
    TOPIC INFORMATION:
    ${topicContext}
    
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
    
          PREVIOUS QUESTIONS TO AVOID:
          ${
						previousQuestions.length > 0
							? previousQuestions
									.map((q) => `Q: ${q.question}\nA: ${q.answer}`)
									.join('\n\n')
							: 'No previous questions.'
					}
          FORMATTING GUIDELINES:
          - Use markdown for emphasis (**bold**, *italic*)
          - Use LaTeX for math ($E = mc^2$)
          - Use triple backticks for code blocks
          - Use proper unicode for symbols (Ω, μ, λ, θ)
          - Use LaTeX for complex formulas ($H_2SO_4$)
          
          Remember: Must Provide ONLY the VALID JSON response, no additional text or explanations.
          Do not include any text outside of the JSON object.
        `;
}

export function generateExplanationPrompt({
	topic,
	question,
	answer,
	language,
}) {
	return `
      Please generate accurate explanantion to show why this answer is correct.
      ${topic} is the topic of the question.
      Explanation Language: ${language || 'English'}
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
      Keep explanation short and crisp, ideally under 200 words.
      Ensure the explanation is in the same language ${
				language || 'English'
			} as the question.
    `;
}
