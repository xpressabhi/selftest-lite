'use client';

import { useEffect, useState, useMemo } from 'react';

/**
 * Confetti celebration component for high scores
 * Shows animated confetti particles when triggered
 * Respects data-saver and reduced-motion preferences
 */
export default function Confetti({
    show = false,
    duration = 4000,
    particleCount = 100,
    onComplete
}) {
    const [isActive, setIsActive] = useState(false);
    const [particles, setParticles] = useState([]);

    // Generate particles with random properties
    const generateParticles = useMemo(() => {
        const colors = [
            '#6366f1', // indigo
            '#8b5cf6', // violet
            '#a855f7', // purple
            '#ec4899', // pink
            '#10b981', // emerald
            '#f59e0b', // amber
            '#3b82f6', // blue
            '#ef4444', // red
        ];

        const shapes = ['circle', 'square', 'triangle', 'star'];

        return Array.from({ length: particleCount }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            delay: Math.random() * 1000,
            duration: 2000 + Math.random() * 2000,
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            size: 8 + Math.random() * 12,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 720,
        }));
    }, [particleCount]);

    useEffect(() => {
        if (show) {
            // Check for data-saver mode
            const isDataSaver = document.documentElement.classList.contains('data-saver');
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            if (isDataSaver || prefersReducedMotion) {
                onComplete?.();
                return;
            }

            setParticles(generateParticles);
            setIsActive(true);

            const timer = setTimeout(() => {
                setIsActive(false);
                onComplete?.();
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [show, duration, generateParticles, onComplete]);

    if (!isActive) return null;

    const renderShape = (particle) => {
        const baseStyle = {
            position: 'absolute',
            left: `${particle.x}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            animation: `confetti-fall ${particle.duration}ms ease-out forwards`,
            animationDelay: `${particle.delay}ms`,
            opacity: 0,
        };

        switch (particle.shape) {
            case 'circle':
                return <div key={particle.id} style={{ ...baseStyle, borderRadius: '50%' }} />;
            case 'square':
                return <div key={particle.id} style={{ ...baseStyle, borderRadius: '2px' }} />;
            case 'triangle':
                return (
                    <div
                        key={particle.id}
                        style={{
                            ...baseStyle,
                            width: 0,
                            height: 0,
                            backgroundColor: 'transparent',
                            borderLeft: `${particle.size / 2}px solid transparent`,
                            borderRight: `${particle.size / 2}px solid transparent`,
                            borderBottom: `${particle.size}px solid ${particle.color}`,
                        }}
                    />
                );
            case 'star':
                return (
                    <div
                        key={particle.id}
                        style={{
                            ...baseStyle,
                            backgroundColor: 'transparent',
                            fontSize: `${particle.size}px`,
                            lineHeight: 1,
                        }}
                    >
                        ✦
                    </div>
                );
            default:
                return <div key={particle.id} style={{ ...baseStyle, borderRadius: '50%' }} />;
        }
    };

    return (
        <>
            <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(-20vh) rotate(0deg) scale(1);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(100vh) rotate(720deg) scale(0.5);
          }
        }

        @keyframes confetti-burst {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>

            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    overflow: 'hidden',
                }}
                aria-hidden="true"
            >
                {particles.map(renderShape)}
            </div>
        </>
    );
}

/**
 * Trophy burst animation for perfect scores
 */
export function TrophyBurst({ show = false }) {
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        if (show) {
            const isDataSaver = document?.documentElement?.classList?.contains('data-saver');
            const prefersReducedMotion = window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

            if (isDataSaver || prefersReducedMotion) return;

            setIsActive(true);
            const timer = setTimeout(() => setIsActive(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [show]);

    if (!isActive) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 9998,
                pointerEvents: 'none',
                animation: 'confetti-burst 0.6s ease-out forwards',
                fontSize: '80px',
            }}
            aria-hidden="true"
        >
            🏆
        </div>
    );
}
