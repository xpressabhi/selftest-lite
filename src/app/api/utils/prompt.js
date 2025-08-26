export function generatePrompt({
	topic,
	numQuestions,
	difficulty,
	testType,
	topicContext,
	previousQuestions,
}) {
	return `You are an expert quiz generator. Generate a ${difficulty}-level ${testType} quiz with ${numQuestions} questions.
    
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
