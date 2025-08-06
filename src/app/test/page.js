'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Test() {
  const [questionPaper, setQuestionPaper] =useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedPaper = localStorage.getItem('questionPaper');
    if (storedPaper) {
      setQuestionPaper(JSON.parse(storedPaper));
    }
    setLoading(false);
  }, []);

  const handleAnswerChange = (questionIndex, answer) => {
    setAnswers({
      ...answers,
      [questionIndex]: answer,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem('userAnswers', JSON.stringify(answers));
    router.push('/results');
  };

  if (loading) {
    return <div className="container text-center mt-5">Loading...</div>;
  }

  if (!questionPaper) {
    return (
      <div className="container text-center mt-5">
        <h1>No test found!</h1>
        <p>Please generate a test first.</p>
        <button className="btn btn-primary" onClick={() => router.push('/generate')}>
          Generate a Test
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-5">
      <h1 className="mb-4">{questionPaper.topic}</h1>
      <form onSubmit={handleSubmit}>
        {questionPaper.questions.map((q, index) => (
          <div key={index} className="card mb-4">
            <div className="card-header">
              Question {index + 1}
            </div>
            <div className="card-body">
              <h5 className="card-title">{q.question}</h5>
              {q.options.map((option, i) => (
                <div key={i} className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name={`question-${index}`}
                    id={`question-${index}-option-${i}`}
                    value={option}
                    onChange={() => handleAnswerChange(index, option)}
                    checked={answers[index] === option}
                  />
                  <label className="form-check-label" htmlFor={`question-${index}-option-${i}`}>
                    {option}
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
        <button type="submit" className="btn btn-success w-100">
          Submit Answers
        </button>
      </form>
    </div>
  );
}
