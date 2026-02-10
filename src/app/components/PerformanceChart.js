'use client';

import { useMemo, useState } from 'react';
import { Card, Badge } from 'react-bootstrap';
import Icon from './Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../constants';

/**
 * PerformanceChart - Pure CSS/SVG performance trend visualization
 * Shows score trends over the last N quizzes with topic breakdown
 */
export default function PerformanceChart() {
    const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const completedTests = useMemo(() => {
        return testHistory
            .filter((t) => t.userAnswers && t.score !== undefined)
            .sort((a, b) => (a.timestamp || a.createdAt || 0) - (b.timestamp || b.createdAt || 0))
            .slice(-15); // Last 15 quizzes
    }, [testHistory]);

    // Compute chart data
    const chartData = useMemo(() => {
        return completedTests.map((t, i) => {
            const percentage = Math.round((t.score / t.totalQuestions) * 100);
            return {
                label: `#${i + 1}`,
                score: percentage,
                topic: t.topic || 'Unknown',
                date: t.timestamp ? new Date(t.timestamp).toLocaleDateString() : 'N/A',
                time: t.timeTaken ? `${Math.floor(t.timeTaken / 60)}m ${t.timeTaken % 60}s` : null,
                raw: `${t.score}/${t.totalQuestions}`,
            };
        });
    }, [completedTests]);

    // Topic frequency breakdown
    const topicBreakdown = useMemo(() => {
        const topics = {};
        completedTests.forEach((t) => {
            const topic = t.topic || 'Unknown';
            if (!topics[topic]) {
                topics[topic] = { count: 0, totalScore: 0, totalQuestions: 0 };
            }
            topics[topic].count += 1;
            topics[topic].totalScore += t.score || 0;
            topics[topic].totalQuestions += t.totalQuestions || 0;
        });

        return Object.entries(topics)
            .map(([name, data]) => ({
                name,
                count: data.count,
                avgScore: data.totalQuestions > 0
                    ? Math.round((data.totalScore / data.totalQuestions) * 100)
                    : 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [completedTests]);

    // Average score
    const avgScore = useMemo(() => {
        if (chartData.length === 0) return 0;
        return Math.round(chartData.reduce((acc, d) => acc + d.score, 0) / chartData.length);
    }, [chartData]);

    // Trend (last 3 vs previous 3)
    const trend = useMemo(() => {
        if (chartData.length < 4) return 'neutral';
        const recent = chartData.slice(-3).reduce((a, d) => a + d.score, 0) / 3;
        const previous = chartData.slice(-6, -3).reduce((a, d) => a + d.score, 0) / Math.min(3, chartData.slice(-6, -3).length || 1);
        if (recent > previous + 5) return 'up';
        if (recent < previous - 5) return 'down';
        return 'neutral';
    }, [chartData]);

    if (chartData.length < 2) return null;

    // SVG chart dimensions
    const W = 600;
    const H = 180;
    const PAD_X = 30;
    const PAD_Y = 20;
    const chartW = W - PAD_X * 2;
    const chartH = H - PAD_Y * 2;

    // Scale points
    const points = chartData.map((d, i) => ({
        x: PAD_X + (i / (chartData.length - 1)) * chartW,
        y: PAD_Y + chartH - (d.score / 100) * chartH,
        ...d,
    }));

    // Build SVG path
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    // Gradient fill area
    const areaD = `${pathD} L ${points[points.length - 1].x} ${H - PAD_Y} L ${points[0].x} ${H - PAD_Y} Z`;

    // Color based on performance
    const getScoreColor = (score) => {
        if (score >= 80) return '#10b981';
        if (score >= 50) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <div className='w-100 mb-4 fade-in' style={{ maxWidth: '720px' }}>
            <Card className='border-0 glass-card shadow-sm'>
                <Card.Body className='p-4'>
                    {/* Header */}
                    <div className='d-flex align-items-center justify-content-between mb-2'>
                        <h5 className='mb-0 d-flex align-items-center gap-2 fw-bold'>
                            <span style={{ fontSize: '1.2rem' }}>📊</span>
                            Performance Trend
                        </h5>
                        <div className='d-flex align-items-center gap-2'>
                            <Badge
                                bg={trend === 'up' ? 'success' : trend === 'down' ? 'danger' : 'secondary'}
                                className='d-flex align-items-center gap-1 px-2 py-1 rounded-pill'
                                style={{ fontSize: '0.7rem' }}
                            >
                                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                                {trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Steady'}
                            </Badge>
                            <span className='fw-bold' style={{ color: getScoreColor(avgScore), fontSize: '0.85rem' }}>
                                Avg {avgScore}%
                            </span>
                        </div>
                    </div>

                    {/* SVG Chart */}
                    <div className='position-relative' style={{ overflow: 'hidden' }}>
                        <svg
                            viewBox={`0 0 ${W} ${H}`}
                            width='100%'
                            height='auto'
                            style={{ maxHeight: '200px' }}
                            className='d-block'
                        >
                            <defs>
                                <linearGradient id='chartGradient' x1='0%' y1='0%' x2='0%' y2='100%'>
                                    <stop offset='0%' stopColor='#6366f1' stopOpacity='0.3' />
                                    <stop offset='100%' stopColor='#6366f1' stopOpacity='0.02' />
                                </linearGradient>
                                <linearGradient id='lineGradient' x1='0%' y1='0%' x2='100%' y2='0%'>
                                    <stop offset='0%' stopColor='#6366f1' />
                                    <stop offset='100%' stopColor='#a855f7' />
                                </linearGradient>
                            </defs>

                            {/* Grid lines */}
                            {[0, 25, 50, 75, 100].map((val) => {
                                const y = PAD_Y + chartH - (val / 100) * chartH;
                                return (
                                    <g key={val}>
                                        <line
                                            x1={PAD_X}
                                            y1={y}
                                            x2={W - PAD_X}
                                            y2={y}
                                            stroke='var(--border-color)'
                                            strokeWidth='0.5'
                                            strokeDasharray={val === 0 || val === 100 ? '' : '4,4'}
                                            opacity='0.5'
                                        />
                                        <text
                                            x={PAD_X - 4}
                                            y={y + 4}
                                            textAnchor='end'
                                            fontSize='9'
                                            fill='var(--text-muted)'
                                        >
                                            {val}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Area fill */}
                            <path
                                d={areaD}
                                fill='url(#chartGradient)'
                            />

                            {/* Line */}
                            <path
                                d={pathD}
                                fill='none'
                                stroke='url(#lineGradient)'
                                strokeWidth='2.5'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            />

                            {/* Data points */}
                            {points.map((p, i) => (
                                <g key={i}>
                                    {/* Hover area (invisible, larger) */}
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r='12'
                                        fill='transparent'
                                        cursor='pointer'
                                        onMouseEnter={() => setHoveredIndex(i)}
                                        onMouseLeave={() => setHoveredIndex(null)}
                                    />
                                    {/* Visible dot */}
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={hoveredIndex === i ? '5' : '3.5'}
                                        fill={getScoreColor(p.score)}
                                        stroke='white'
                                        strokeWidth='2'
                                        style={{ transition: 'r 0.15s ease' }}
                                    />
                                </g>
                            ))}

                            {/* Hover tooltip */}
                            {hoveredIndex !== null && points[hoveredIndex] && (() => {
                                const p = points[hoveredIndex];
                                const tooltipW = 100;
                                const tooltipX = Math.min(Math.max(p.x - tooltipW / 2, 5), W - tooltipW - 5);
                                const tooltipY = p.y < 60 ? p.y + 15 : p.y - 55;
                                return (
                                    <g>
                                        <rect
                                            x={tooltipX}
                                            y={tooltipY}
                                            width={tooltipW}
                                            height='44'
                                            rx='6'
                                            fill='var(--bg-primary)'
                                            stroke='var(--border-color)'
                                            strokeWidth='1'
                                            filter='drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                                        />
                                        <text x={tooltipX + 8} y={tooltipY + 16} fontSize='11' fontWeight='700' fill={getScoreColor(p.score)}>
                                            {p.score}% ({p.raw})
                                        </text>
                                        <text x={tooltipX + 8} y={tooltipY + 32} fontSize='9' fill='var(--text-muted)'>
                                            {p.topic.length > 15 ? p.topic.slice(0, 15) + '…' : p.topic}
                                        </text>
                                    </g>
                                );
                            })()}
                        </svg>
                    </div>

                    {/* Topic breakdown */}
                    {topicBreakdown.length > 1 && (
                        <div className='mt-3 pt-3 border-top'>
                            <small className='text-muted fw-bold text-uppercase d-block mb-2' style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                                Top Topics
                            </small>
                            <div className='d-flex flex-wrap gap-2'>
                                {topicBreakdown.map((topic) => (
                                    <Badge
                                        key={topic.name}
                                        bg='light'
                                        text='dark'
                                        className='d-flex align-items-center gap-1 px-2 py-1 rounded-pill border'
                                        style={{ fontSize: '0.7rem' }}
                                    >
                                        <span
                                            className='rounded-circle d-inline-block'
                                            style={{
                                                width: '6px',
                                                height: '6px',
                                                background: getScoreColor(topic.avgScore),
                                            }}
                                        />
                                        {topic.name.length > 20 ? topic.name.slice(0, 20) + '…' : topic.name}
                                        <span className='text-muted ms-1'>({topic.avgScore}%)</span>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </Card.Body>
            </Card>
        </div>
    );
}
