# Selftest-lite

Selftest-lite is a web application that allows you to generate and take multiple-choice quizzes on any topic you can imagine. Simply provide a description, and the app will use AI to generate a test for you.

## Features

- **Dynamic Test Generation**: Describe the test you want, and the app will generate it for you.
- **Multiple-Choice Quizzes**: Take tests with multiple-choice questions.
- **Instant Results**: Get your score immediately after finishing a test.
- **Answer Review**: Review your answers and see the correct ones.

## How it Works

Selftest-lite is built with [Next.js](https://nextjs.org) and uses the [Google Gemini API](https://ai.google.dev/) to generate quizzes.

- The frontend is built with [React](https://react.dev/) and [Bootstrap](https://getbootstrap.com/).
- The backend is a simple Next.js API route that communicates with the Gemini API.
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

This project requires a Google Gemini API key to generate tests.

1.  Create a file named `.env.local` in the root of the project.
2.  Add your Gemini API key to the file:

```
GEMINI_API_KEY=your_api_key_here
```

You can get a Gemini API key from [Google AI Studio](https://aistudio.google.com/).

### 4. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## License

This project is licensed under the MIT License.
