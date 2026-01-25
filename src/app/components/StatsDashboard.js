'use client';

import React, { useMemo } from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';

export default function StatsDashboard() {
    const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);
    const { t } = useLanguage();

    const stats = useMemo(() => {
        if (!testHistory || testHistory.length === 0) return null;

        const completedTests = testHistory.filter((t) => t.userAnswers);
        if (completedTests.length === 0) return null;

        const totalTests = completedTests.length;
        const totalQuestions = completedTests.reduce(
            (acc, t) => acc + (t.totalQuestions || 0),
            0,
        );
        const totalScore = completedTests.reduce((acc, t) => acc + (t.score || 0), 0);
        const averageScore = Math.round((totalScore / totalQuestions) * 100) || 0;
        const totalTime = completedTests.reduce(
            (acc, t) => acc + (t.timeTaken || 0),
            0,
        );

        // Format time (e.g., "2h 15m")
        const formatTotalTime = (seconds) => {
            if (!seconds) return '0m';
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            if (hrs > 0) return `${hrs}h ${mins}m`;
            return `${mins}m`;
        };

        return {
            totalTests,
            averageScore,
            questionsAnswered: totalQuestions,
            timeSpent: formatTotalTime(totalTime),
        };
    }, [testHistory]);

    if (!stats) return null;

    return (
        <div className='w-100 mb-4 fade-in' style={{ maxWidth: '720px' }}>
            <Card className='border-0 glass-card shadow-sm'>
                <Card.Body className='p-4'>
                    <h5 className='mb-4 d-flex align-items-center gap-2 fw-bold text-primary'>
                        <Icon name='trophy' /> Your Progress
                    </h5>
                    <Row className='g-3 text-center'>
                        <Col xs={6} md={3}>
                            <div className='p-3 rounded-3 bg-light bg-opacity-50 h-100'>
                                <div className='text-muted small text-uppercase fw-bold mb-1'>
                                    Quizzes
                                </div>
                                <div className='h3 fw-bold mb-0 text-dark'>{stats.totalTests}</div>
                            </div>
                        </Col>
                        <Col xs={6} md={3}>
                            <div className='p-3 rounded-3 bg-light bg-opacity-50 h-100'>
                                <div className='text-muted small text-uppercase fw-bold mb-1'>
                                    Avg Score
                                </div>
                                <div className={`h3 fw-bold mb-0 ${stats.averageScore >= 80 ? 'text-success' : stats.averageScore >= 50 ? 'text-warning' : 'text-danger'}`}>
                                    {stats.averageScore}%
                                </div>
                            </div>
                        </Col>
                        <Col xs={6} md={3}>
                            <div className='p-3 rounded-3 bg-light bg-opacity-50 h-100'>
                                <div className='text-muted small text-uppercase fw-bold mb-1'>
                                    Questions
                                </div>
                                <div className='h3 fw-bold mb-0 text-dark'>{stats.questionsAnswered}</div>
                            </div>
                        </Col>
                        <Col xs={6} md={3}>
                            <div className='p-3 rounded-3 bg-light bg-opacity-50 h-100'>
                                <div className='text-muted small text-uppercase fw-bold mb-1'>
                                    Time Spent
                                </div>
                                <div className='h3 fw-bold mb-0 text-dark'>{stats.timeSpent}</div>
                            </div>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>
        </div>
    );
}
