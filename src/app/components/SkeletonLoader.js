'use client'

import { Card } from 'react-bootstrap'

/**
 * Skeleton loading components for better perceived performance
 * Shows placeholder content while actual content loads
 */

// Base skeleton with shimmer animation
const SkeletonBase = ({ className = '', style = {} }) => (
    <div
        className={`skeleton-shimmer ${className}`}
        style={{
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: '8px',
            ...style
        }}
    />
)

// Skeleton for text lines
export const SkeletonText = ({ lines = 1, width = '100%' }) => (
    <div className="d-flex flex-column gap-2">
        {Array.from({ length: lines }).map((_, i) => (
            <SkeletonBase
                key={i}
                style={{
                    height: '16px',
                    width: i === lines - 1 && lines > 1 ? '70%' : width
                }}
            />
        ))}
    </div>
)

// Skeleton for a quiz question card
export const SkeletonQuestionCard = () => (
    <Card className="border-0 shadow-sm mb-3">
        <Card.Body className="p-4">
            {/* Question number badge */}
            <div className="d-flex align-items-center gap-3 mb-3">
                <SkeletonBase style={{ width: '80px', height: '28px' }} />
            </div>

            {/* Question text */}
            <SkeletonText lines={2} />

            {/* Options */}
            <div className="mt-4 d-flex flex-column gap-2">
                {[1, 2, 3, 4].map((i) => (
                    <SkeletonBase
                        key={i}
                        style={{ height: '48px', width: '100%' }}
                    />
                ))}
            </div>
        </Card.Body>
    </Card>
)

// Skeleton for the quiz generation form
export const SkeletonForm = () => (
    <Card className="border-0 shadow-sm" style={{ maxWidth: '720px' }}>
        <Card.Body className="p-4 p-md-5">
            {/* Title */}
            <div className="text-center mb-4">
                <SkeletonBase style={{ height: '40px', width: '60%', margin: '0 auto 12px' }} />
                <SkeletonBase style={{ height: '20px', width: '40%', margin: '0 auto' }} />
            </div>

            {/* Test ID input */}
            <div className="mb-4">
                <SkeletonBase style={{ height: '48px', width: '100%' }} />
            </div>

            {/* Divider */}
            <SkeletonBase style={{ height: '1px', width: '100%', margin: '24px 0' }} />

            {/* Textarea */}
            <div className="mb-4">
                <SkeletonBase style={{ height: '120px', width: '100%' }} />
            </div>

            {/* Submit button */}
            <SkeletonBase style={{ height: '56px', width: '100%' }} />
        </Card.Body>
    </Card>
)

// Skeleton for results page
export const SkeletonResults = () => (
    <div className="container py-4" style={{ maxWidth: '800px' }}>
        {/* Score card */}
        <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-4 text-center">
                <SkeletonBase style={{ height: '80px', width: '80px', borderRadius: '50%', margin: '0 auto 16px' }} />
                <SkeletonBase style={{ height: '32px', width: '150px', margin: '0 auto 8px' }} />
                <SkeletonBase style={{ height: '20px', width: '200px', margin: '0 auto' }} />
            </Card.Body>
        </Card>

        {/* Questions review */}
        <SkeletonQuestionCard />
        <SkeletonQuestionCard />
    </div>
)

// Skeleton for test history list
export const SkeletonHistoryList = () => (
    <div className="mt-4" style={{ maxWidth: '800px' }}>
        <SkeletonBase style={{ height: '32px', width: '200px', marginBottom: '16px' }} />
        {[1, 2, 3].map((i) => (
            <div key={i} className="d-flex justify-content-between align-items-center p-3 mb-2 bg-white rounded shadow-sm">
                <div className="flex-grow-1">
                    <SkeletonBase style={{ height: '20px', width: '60%', marginBottom: '8px' }} />
                    <SkeletonBase style={{ height: '14px', width: '30%' }} />
                </div>
                <SkeletonBase style={{ height: '32px', width: '60px', borderRadius: '16px' }} />
            </div>
        ))}
    </div>
)

export default SkeletonBase
