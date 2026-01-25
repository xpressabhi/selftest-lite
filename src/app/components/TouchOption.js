'use client'

import { useState } from 'react'
import { Card } from 'react-bootstrap'
import Icon from './Icon'

/**
 * Touch-friendly option button for quiz answers
 * Designed for mobile devices with larger tap targets and visual feedback
 */
export default function TouchOption({
    option,
    index,
    isSelected,
    isCorrect,
    isIncorrect,
    showResult,
    disabled,
    onSelect
}) {
    const [isTouching, setIsTouching] = useState(false)

    // Generate letter label (A, B, C, D...)
    const letter = String.fromCharCode(65 + index)

    // Determine the variant/style based on state
    const getVariantStyles = () => {
        if (showResult) {
            if (isCorrect) {
                return {
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    borderColor: '#059669',
                    color: 'white',
                }
            }
            if (isIncorrect) {
                return {
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderColor: '#dc2626',
                    color: 'white',
                }
            }
        }
        if (isSelected) {
            return {
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                borderColor: '#6366f1',
                color: 'white',
            }
        }
        return {
            background: 'white',
            borderColor: '#e5e7eb',
            color: '#374151',
        }
    }

    const styles = getVariantStyles()

    const handleTouchStart = () => {
        if (!disabled) setIsTouching(true)
    }

    const handleTouchEnd = () => {
        setIsTouching(false)
    }

    const handleClick = () => {
        if (!disabled && onSelect) {
            onSelect(option)
        }
    }

    return (
        <Card
            as="button"
            type="button"
            disabled={disabled}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
            className="w-100 text-start border-2 mb-2"
            style={{
                ...styles,
                minHeight: '60px',
                padding: '12px 16px',
                borderRadius: '12px',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled && !showResult ? 0.7 : 1,
                transform: isTouching ? 'scale(0.98)' : 'scale(1)',
                transition: 'transform 0.1s ease, background 0.2s ease, border-color 0.2s ease',
                outline: 'none',
                boxShadow: isSelected && !showResult ? '0 4px 12px rgba(99, 102, 241, 0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
            }}
        >
            <div className="d-flex align-items-center gap-3">
                {/* Letter badge */}
                <div
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: isSelected || showResult ? 'rgba(255,255,255,0.2)' : '#f3f4f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '600',
                        fontSize: '14px',
                        flexShrink: 0,
                        color: isSelected || (showResult && (isCorrect || isIncorrect)) ? 'white' : '#6b7280',
                    }}
                >
                    {showResult && isCorrect ? (
                        <Icon name="checkCircle" size={18} />
                    ) : showResult && isIncorrect ? (
                        <Icon name="timesCircle" size={18} />
                    ) : (
                        letter
                    )}
                </div>

                {/* Option text */}
                <span
                    style={{
                        fontSize: '15px',
                        lineHeight: '1.4',
                        wordBreak: 'break-word',
                    }}
                >
                    {option}
                </span>
            </div>
        </Card>
    )
}
