# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Selftest-lite is a web application that allows you to generate and take multiple-choice quizzes on any topic you can imagine. The app uses AI from the Google Gemini API to dynamically generate tests based on user descriptions.

## Common Commands
- `npm install`: Install project dependencies.
- `npm run dev`: Start the development server.
- `gh pr view`: View or create pull requests using GitHub CLI.
- `git status`, `git add .`, `git commit -m "message"`, `git push`: Standard Git commands for version control.

## High-Level Architecture
1. **Frontend**: Built with [Next.js](https://nextjs.org) and [React](https://react.dev/) using [Bootstrap](https://getbootstrap.com/).
2. **Backend**: A simple Next.js API route that communicates with the Gemini API to generate quizzes.
3. **API Interaction**: The frontend sends prompts to the Gemini API, which returns JSON data that is parsed and displayed as a quiz.

## Development Setup
1. **Prerequisites**
   - Node.js (version 18 or higher)
   - npm or yarn
2. **Installation**
   ```bash
   git clone <repository-url>
   cd selftest-lite
   npm install
   ```
3. **Environment Variables**
   Create a file named `.env.local` in the root of the project and add your Gemini API key:
   ```text
   GEMINI_API_KEY=your_api_key_here
   ```
4. **Running the Development Server**
   ```bash
   npm run dev
   ````Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Additional Resources
- Google Gemini API Documentation: <https://ai.google.dev/>