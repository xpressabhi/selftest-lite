# Selftest-lite

Selftest-lite is a SvelteKit web application for generating and taking AI-powered multiple-choice quizzes.

## Features

- **Dynamic Test Generation**: Describe the test you want, and the app will generate it for you.
- **Multiple-Choice Quizzes**: Take tests with multiple-choice questions.
- **Instant Results**: Get your score immediately after finishing a test.
- **Answer Review**: Review your answers and see the correct ones.

## How it Works

Selftest-lite is built with [SvelteKit](https://svelte.dev/docs/kit/introduction), [Tailwind CSS](https://tailwindcss.com/), and the [Google Gemini API](https://ai.google.dev/).

- The frontend uses Svelte components and Tailwind-generated CSS.
- The backend uses SvelteKit server routes to communicate with Gemini.
- When you request a new test, the application sends a prompt to the Gemini API and parses the response to create a quiz.

## Getting Started

To run this project locally, follow these steps:

### 1. Prerequisites

- [Node.js](https://nodejs.org/en) (version 18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd selftest-lite
npm install
```

### 3. Environment Variables

This project requires Gemini and database configuration.

1.  Create a file named `.env.local` in the root of the project.
2.  Add the following variables:

```
GEMINI_API_KEY=your_api_key_here
DATABASE_URL=postgres://username:password@host:5432/database
```

- You can get a Gemini API key from [Google AI Studio](https://aistudio.google.com/).

### 4. Run the Development Server

Start the SvelteKit development server:

```bash
npm run dev
```

Open the URL printed by Vite (normally [http://localhost:5173](http://localhost:5173)) in your browser.

## License

This project is licensed under the MIT License.
