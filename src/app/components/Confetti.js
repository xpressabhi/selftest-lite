'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSaver } from '../context/DataSaverContext';

const CONFETTI_COLORS = [
	'#2563eb',
	'#ef4444',
	'#f59e0b',
	'#10b981',
	'#14b8a6',
	'#f97316',
	'#ec4899',
	'#8b5cf6',
];

const CONFETTI_SHAPES = ['pill', 'diamond', 'dot'];
const MAX_VISIBLE_PIECES = 18;

function createPieces(pieceCount) {
	return Array.from({ length: pieceCount }, (_, index) => ({
		id: index,
		left: Number(((index + 0.5) * (100 / pieceCount)).toFixed(2)),
		delay: Math.round((index % 6) * 90),
		duration: 1600 + (index % 5) * 220,
		drift: (index % 2 === 0 ? 1 : -1) * (18 + (index % 4) * 10),
		size: 8 + (index % 3) * 3,
		rotation: 120 + (index % 5) * 45,
		color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
		shape: CONFETTI_SHAPES[index % CONFETTI_SHAPES.length],
	}));
}

/**
 * Lightweight celebration component for high scores.
 * Uses a small fixed pool of CSS-animated pieces instead of hundreds of DOM nodes.
 */
export default function Confetti({
	show = false,
	duration = 4000,
	particleCount = 100,
	onComplete,
}) {
	const { shouldReduceAnimations } = useDataSaver();
	const [isActive, setIsActive] = useState(false);
	const pieceCount = Math.max(8, Math.min(MAX_VISIBLE_PIECES, Math.round(particleCount / 8)));
	const pieces = useMemo(() => createPieces(pieceCount), [pieceCount]);

	useEffect(() => {
		if (!show) {
			setIsActive(false);
			return undefined;
		}

		if (
			typeof window !== 'undefined' &&
			(window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
				shouldReduceAnimations)
		) {
			onComplete?.();
			return undefined;
		}

		setIsActive(true);
		const timer = setTimeout(() => {
			setIsActive(false);
			onComplete?.();
		}, duration);

		return () => clearTimeout(timer);
	}, [duration, onComplete, shouldReduceAnimations, show]);

	if (!isActive) return null;

	return (
		<>
			<div className="confetti-overlay" aria-hidden="true">
				{pieces.map((piece) => (
					<span
						key={piece.id}
						className={`confetti-piece ${piece.shape}`}
						style={{
							'--confetti-left': `${piece.left}%`,
							'--confetti-delay': `${piece.delay}ms`,
							'--confetti-duration': `${piece.duration}ms`,
							'--confetti-drift': `${piece.drift}px`,
							'--confetti-size': `${piece.size}px`,
							'--confetti-rotation': `${piece.rotation}deg`,
							'--confetti-color': piece.color,
						}}
					/>
				))}
			</div>

			<style jsx>{`
				.confetti-overlay {
					position: fixed;
					inset: 0;
					pointer-events: none;
					z-index: 9999;
					overflow: hidden;
					contain: strict;
				}

				.confetti-piece {
					position: absolute;
					top: -8vh;
					left: var(--confetti-left);
					width: var(--confetti-size);
					height: calc(var(--confetti-size) * 1.8);
					background: var(--confetti-color);
					opacity: 0;
					transform: translate3d(0, -8vh, 0) rotate(0deg);
					animation: confetti-fall var(--confetti-duration) ease-out var(--confetti-delay) forwards;
					will-change: transform, opacity;
				}

				.confetti-piece.dot {
					height: var(--confetti-size);
					border-radius: 999px;
				}

				.confetti-piece.pill {
					border-radius: 999px;
				}

				.confetti-piece.diamond {
					border-radius: 2px;
					transform: translate3d(0, -8vh, 0) rotate(45deg);
				}

				@keyframes confetti-fall {
					0% {
						opacity: 0;
						transform: translate3d(0, -8vh, 0) rotate(0deg);
					}
					12% {
						opacity: 1;
					}
					100% {
						opacity: 0;
						transform: translate3d(var(--confetti-drift), 104vh, 0)
							rotate(var(--confetti-rotation));
					}
				}
			`}</style>
		</>
	);
}

/**
 * Trophy burst animation for perfect scores.
 */
export function TrophyBurst({ show = false }) {
	const { shouldReduceAnimations } = useDataSaver();
	const [isActive, setIsActive] = useState(false);

	useEffect(() => {
		if (!show || shouldReduceAnimations) {
			setIsActive(false);
			return undefined;
		}

		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			return undefined;
		}

		setIsActive(true);
		const timer = setTimeout(() => setIsActive(false), 1800);
		return () => clearTimeout(timer);
	}, [show, shouldReduceAnimations]);

	if (!isActive) return null;

	return (
		<div className="trophy-burst" aria-hidden="true">
			<span className="trophy-glyph">🏆</span>
			<style jsx>{`
				.trophy-burst {
					position: fixed;
					top: 50%;
					left: 50%;
					transform: translate(-50%, -50%);
					z-index: 9998;
					pointer-events: none;
				}

				.trophy-glyph {
					display: inline-block;
					font-size: 80px;
					animation: trophy-pop 600ms ease-out forwards;
					will-change: transform, opacity;
				}

				@keyframes trophy-pop {
					0% {
						opacity: 0;
						transform: scale(0.8);
					}
					60% {
						opacity: 1;
						transform: scale(1.06);
					}
					100% {
						opacity: 1;
						transform: scale(1);
					}
				}
			`}</style>
		</div>
	);
}
