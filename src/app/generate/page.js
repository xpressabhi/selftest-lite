'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Generate() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!topic) {
      setError('Please provide a description for the test.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic }),
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
      <p className="lead mb-5">Describe the test you want to generate.</p>
      <form onSubmit={handleSubmit} className="w-50">
        <div className="form-group mb-3">
          <label htmlFor="topic" className="form-label">Test Description</label>
          <textarea
            id="topic"
            className="form-control"
            rows="5"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., A 10-question multiple-choice quiz on the basics of React, including components, props, and state."
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
