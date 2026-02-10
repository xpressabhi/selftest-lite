'use client';

import { useState, useEffect } from 'react';
import { Card, Badge } from 'react-bootstrap';
import Icon from './Icon';
import useStreak from '../hooks/useStreak';

/**
 * StreakBanner - Shows current streak, weekly activity dots, and streak-at-risk warnings
 * Displayed on the home page above the quiz form
 */
export default function StreakBanner() {
    const {
        currentStreak,
        longestStreak,
        freezesRemaining,
        isActiveToday,
        isAtRisk,
        weekActivity,
        justExtended,
        clearJustExtended,
    } = useStreak();

    const [showPulse, setShowPulse] = useState(false);

    // Animate on streak extension
    useEffect(() => {
        if (justExtended) {
            setShowPulse(true);
            const timer = setTimeout(() => {
                setShowPulse(false);
                clearJustExtended();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [justExtended, clearJustExtended]);

    // Don't show if no streak data at all
    if (currentStreak === 0 && longestStreak === 0 && !weekActivity.some((d) => d.active)) {
        return null;
    }

    return (
        <div className='w-100 mb-4 fade-in' style={{ maxWidth: '720px' }}>
            <Card className='border-0 glass-card shadow-sm overflow-hidden'>
                {/* At-risk warning banner */}
                {isAtRisk && (
                    <div
                        className='px-3 py-2 d-flex align-items-center justify-content-center gap-2'
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: 'white',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                        }}
                    >
                        <span>⚠️</span>
                        <span>Your streak is at risk! Take a quiz today to keep it alive.</span>
                        {freezesRemaining > 0 && (
                            <Badge bg='dark' pill className='ms-1' style={{ fontSize: '0.65rem' }}>
                                🧊 {freezesRemaining} freeze{freezesRemaining > 1 ? 's' : ''} left
                            </Badge>
                        )}
                    </div>
                )}

                <Card.Body className='p-3 p-md-4'>
                    <div className='d-flex align-items-center justify-content-between mb-3'>
                        {/* Streak counter */}
                        <div className='d-flex align-items-center gap-3'>
                            <div
                                className={`d-flex align-items-center justify-content-center rounded-circle ${showPulse ? 'streak-pulse' : ''}`}
                                style={{
                                    width: '52px',
                                    height: '52px',
                                    background: currentStreak > 0
                                        ? 'linear-gradient(135deg, #f97316, #ef4444)'
                                        : 'var(--bg-tertiary)',
                                    fontSize: '24px',
                                    flexShrink: 0,
                                    transition: 'all 0.3s ease',
                                }}
                            >
                                {currentStreak > 0 ? '🔥' : '💤'}
                            </div>
                            <div>
                                <div className='d-flex align-items-baseline gap-2'>
                                    <span
                                        className='fw-bold'
                                        style={{
                                            fontSize: '1.5rem',
                                            lineHeight: 1,
                                            color: currentStreak > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                                        }}
                                    >
                                        {currentStreak}
                                    </span>
                                    <span className='text-muted small fw-medium'>
                                        day{currentStreak !== 1 ? 's' : ''} streak
                                    </span>
                                </div>
                                {longestStreak > currentStreak && (
                                    <small className='text-muted d-flex align-items-center gap-1' style={{ fontSize: '0.7rem' }}>
                                        <Icon name='trophy' size={10} className='text-warning' />
                                        Best: {longestStreak} days
                                    </small>
                                )}
                            </div>
                        </div>

                        {/* Active today badge */}
                        {isActiveToday && (
                            <Badge
                                bg='success'
                                className='d-flex align-items-center gap-1 px-3 py-2 rounded-pill'
                                style={{ fontSize: '0.7rem' }}
                            >
                                <Icon name='checkCircle' size={12} />
                                Done Today
                            </Badge>
                        )}
                    </div>

                    {/* Weekly activity dots */}
                    <div className='d-flex justify-content-between gap-1'>
                        {weekActivity.map((day) => (
                            <div
                                key={day.date}
                                className='d-flex flex-column align-items-center gap-1 flex-grow-1'
                                title={`${day.date}: ${day.quizCount} quiz${day.quizCount !== 1 ? 'zes' : ''}`}
                            >
                                <div
                                    className='rounded-circle'
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        background: day.active
                                            ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                                            : day.isToday
                                                ? 'var(--border-color)'
                                                : 'var(--bg-tertiary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        color: day.active ? 'white' : 'var(--text-muted)',
                                        fontWeight: day.active ? 700 : 400,
                                        border: day.isToday && !day.active ? '2px dashed var(--accent-primary)' : 'none',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {day.active ? '✓' : ''}
                                </div>
                                <span
                                    className='text-muted'
                                    style={{
                                        fontSize: '0.6rem',
                                        fontWeight: day.isToday ? 700 : 400,
                                        color: day.isToday ? 'var(--accent-primary)' : undefined,
                                    }}
                                >
                                    {day.dayName}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card.Body>
            </Card>

            <style jsx>{`
				@keyframes streakPulse {
					0% { transform: scale(1); }
					50% { transform: scale(1.15); }
					100% { transform: scale(1); }
				}
				.streak-pulse {
					animation: streakPulse 0.5s ease-in-out 3;
				}
			`}</style>
        </div>
    );
}
