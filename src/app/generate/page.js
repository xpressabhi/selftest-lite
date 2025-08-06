'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Generate() {
  const [topic, setTopic] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!topic || !apiKey) {
      setError('Please provide a topic and your API key.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic, apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'An error occurred while generating the test.');
      }

      const questionPaper = await response.json();
      localStorage.setItem('questionPaper', JSON.stringify(questionPaper));
      router.push('/test');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container d-flex flex-column align-items-center justify-content-center min-vh-100 bg-light text-dark">
      <h1 className="display-4 mb-4">Generate a Test</h1>
      <p className="lead mb-5">Enter a topic and your Gemini API key to generate a test.</p>
      <form onSubmit={handleSubmit} className="w-50">
        <div className="form-group mb-3">
          <label htmlFor="topic" className="form-label">Topic</label>
          <input
            type="text"
            id="topic"
            className="form-control"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., JavaScript Basics"
          />
        </div>
        <div className="form-group mb-3">
          <label htmlFor="apiKey" className="form-label">Gemini API Key</label>
          <input
            type="password"
            id="apiKey"
            className="form-control"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
          />
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <button type="submit" className="btn btn-primary w-100" disabled={loading}>
          {loading ? 'Generating...' : 'Generate Test'}
        </button>
      </form>
    </div>
  );
}
