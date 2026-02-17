'use client';

import { useMemo } from 'react';
import { Card, Row, Col, ProgressBar } from 'react-bootstrap';
import Icon from './Icon';
import useAchievements from '../hooks/useAchievements';
import useStreak from '../hooks/useStreak';
import { useLanguage } from '../context/LanguageContext';

/**
 * AchievementShowcase - Displays unlocked achievements and progress
 * Shows on the home page below stats dashboard
 */
export default function AchievementShowcase({ compact = false }) {
    const { t } = useLanguage();
    const { longestStreak } = useStreak();
    const {
        allAchievements,
        unlockedCount,
        totalCount,
        progress,
    } = useAchievements({ longestStreak });

    // Group by category
    const grouped = useMemo(() => {
        const groups = {};
        allAchievements.forEach((a) => {
            if (!groups[a.category]) groups[a.category] = [];
            groups[a.category].push(a);
        });
        return groups;
    }, [allAchievements]);

    const categoryLabels = {
        milestones: `🎯 ${t('milestones')}`,
        performance: `⭐ ${t('performance')}`,
        streaks: `🔥 ${t('streaks')}`,
        special: `✨ ${t('special')}`,
    };

    if (compact) {
        // Compact version: just show unlocked badges in a row
        const unlocked = allAchievements.filter((a) => a.unlocked);
        if (unlocked.length === 0) return null;

        return (
            <div className='d-flex flex-wrap gap-2 align-items-center'>
                {unlocked.map((a) => (
                    <span
                        key={a.id}
                        title={`${a.title}: ${a.description}`}
                        style={{
                            fontSize: '1.4rem',
                            cursor: 'default',
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                        }}
                    >
                        {a.icon}
                    </span>
                ))}
                {unlockedCount < totalCount && (
                    <span
                        className='text-muted small fw-medium'
                        style={{ fontSize: '0.7rem' }}
                    >
                        +{totalCount - unlockedCount} {t('locked')}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className='w-100 mb-4 fade-in' style={{ maxWidth: '720px' }}>
            <Card className='border-0 glass-card shadow-sm'>
                <Card.Body className='p-4'>
                    {/* Header with progress */}
                    <div className='d-flex align-items-center justify-content-between mb-3'>
                        <h5 className='mb-0 d-flex align-items-center gap-2 fw-bold'>
                            <span style={{ fontSize: '1.2rem' }}>🏆</span>
                            {t('achievements')}
                        </h5>
                        <span className='text-muted small fw-bold'>
                            {unlockedCount}/{totalCount}
                        </span>
                    </div>

                    <ProgressBar
                        now={progress}
                        variant='primary'
                        style={{ height: '6px', borderRadius: '10px' }}
                        className='mb-4 bg-secondary bg-opacity-10'
                    />

                    {/* Achievement categories */}
                    {Object.entries(grouped).map(([category, achievements]) => (
                        <div key={category} className='mb-4'>
                            <small className='text-muted fw-bold text-uppercase d-block mb-2' style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                                {categoryLabels[category] || category}
                            </small>
                            <Row className='g-2'>
                                {achievements.map((a) => (
                                    <Col xs={6} sm={4} md={3} key={a.id}>
                                        <div
                                            className={`p-3 rounded-3 text-center h-100 d-flex flex-column align-items-center justify-content-center gap-1 ${a.unlocked ? '' : 'opacity-40'
                                                }`}
                                            style={{
                                                background: a.unlocked
                                                    ? 'linear-gradient(145deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.04))'
                                                    : 'var(--bg-tertiary)',
                                                border: a.unlocked
                                                    ? '1px solid rgba(99, 102, 241, 0.2)'
                                                    : '1px solid transparent',
                                                minHeight: '90px',
                                                transition: 'all 0.2s ease',
                                            }}
                                            title={a.description}
                                        >
                                            <span
                                                style={{
                                                    fontSize: '1.6rem',
                                                    filter: a.unlocked
                                                        ? 'none'
                                                        : 'grayscale(100%) opacity(0.3)',
                                                    transition: 'filter 0.3s ease',
                                                }}
                                            >
                                                {a.icon}
                                            </span>
                                            <span
                                                className='fw-bold'
                                                style={{
                                                    fontSize: '0.7rem',
                                                    color: a.unlocked ? 'var(--text-primary)' : 'var(--text-muted)',
                                                    lineHeight: 1.2,
                                                }}
                                            >
                                                {a.title}
                                            </span>
                                            {!a.unlocked && (
                                                <Icon
                                                    name='circle'
                                                    size={8}
                                                    className='text-muted opacity-25'
                                                />
                                            )}
                                        </div>
                                    </Col>
                                ))}
                            </Row>
                        </div>
                    ))}
                </Card.Body>
            </Card>
        </div>
    );
}
