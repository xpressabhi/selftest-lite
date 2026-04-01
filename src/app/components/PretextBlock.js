'use client';

import { useEffect, useRef, useState } from 'react';
import { layout, prepareWithSegments, setLocale, walkLineRanges } from '@chenglou/pretext';
import { useLanguage } from '../context/LanguageContext';
import { useDataSaver } from '../context/DataSaverContext';

const preparedCache = new Map();
let activeLocale = null;

function parsePx(value) {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getFontFromStyles(styles) {
	return styles.font.length > 0
		? styles.font
		: `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} / ${styles.lineHeight} ${styles.fontFamily}`;
}

function getPreparedText(text, font, locale) {
	const cacheKey = `${locale}__${font}__${text}`;
	const cached = preparedCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const prepared = prepareWithSegments(text, font, {
		whiteSpace: 'pre-wrap',
	});
	preparedCache.set(cacheKey, prepared);
	return prepared;
}

function ensureLocale(locale) {
	if (activeLocale === locale) {
		return;
	}

	setLocale(locale);
	activeLocale = locale;
	preparedCache.clear();
}

function getRenderWidth(prepared, maxWidth, lineCount) {
	if (maxWidth < 560 || lineCount <= 1) {
		return maxWidth;
	}

	let widestLine = 0;
	walkLineRanges(prepared, maxWidth, (line) => {
		if (line.width > widestLine) {
			widestLine = line.width;
		}
	});

	if (widestLine <= 0) {
		return maxWidth;
	}

	const shrinkFloor = Math.max(280, maxWidth * 0.72);
	return Math.min(maxWidth, Math.max(shrinkFloor, Math.ceil(widestLine + 2)));
}

export default function PretextBlock({
	as: Component = 'span',
	children,
	className = '',
	style,
}) {
	const containerRef = useRef(null);
	const [metrics, setMetrics] = useState(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const [fontReadyTick, setFontReadyTick] = useState(0);
	const { language } = useLanguage();
	const { isDataSaverActive } = useDataSaver();
	const text = typeof children === 'string' ? children : String(children ?? '');

	useEffect(() => {
		if (typeof document === 'undefined' || !document.fonts?.ready) {
			return undefined;
		}

		let mounted = true;
		document.fonts.ready.then(() => {
			if (mounted) {
				setFontReadyTick((prev) => prev + 1);
			}
		});

		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (!containerRef.current || typeof ResizeObserver === 'undefined') {
			return undefined;
		}

		const observer = new ResizeObserver((entries) => {
			const nextWidth = entries[0]?.contentRect?.width ?? 0;
			setContainerWidth((prev) => (
				Math.abs(prev - nextWidth) > 0.5 ? nextWidth : prev
			));
		});

		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!containerRef.current || !text.trim() || containerWidth <= 0) {
			setMetrics(null);
			return;
		}

		const locale = language === 'hindi' ? 'hi-IN' : 'en-IN';
		const styles = window.getComputedStyle(containerRef.current);
		const lineHeight = parsePx(styles.lineHeight) || Math.round(parsePx(styles.fontSize) * 1.6);
		const font = getFontFromStyles(styles);

		try {
			ensureLocale(locale);
			const prepared = getPreparedText(text, font, locale);
			const baseMetrics = layout(prepared, containerWidth, lineHeight);
			const renderWidth = isDataSaverActive
				? containerWidth
				: getRenderWidth(prepared, containerWidth, baseMetrics.lineCount);
			const nextMetrics = layout(prepared, renderWidth, lineHeight);

			setMetrics({
				height: Math.ceil(nextMetrics.height),
				lineCount: nextMetrics.lineCount,
				width: Math.ceil(renderWidth),
			});
		} catch {
			setMetrics(null);
		}
	}, [containerWidth, fontReadyTick, isDataSaverActive, language, text]);

	const combinedClassName = [
		'pretext-shell',
		metrics?.lineCount >= 6 ? 'pretext-shell-dense' : '',
		className,
	].filter(Boolean).join(' ');

	return (
		<Component ref={containerRef} className={combinedClassName} style={style}>
			<span
				className='pretext-copy'
				style={metrics ? {
					maxWidth: '100%',
					minHeight: `${metrics.height}px`,
					width: `${metrics.width}px`,
				} : undefined}
			>
				{text}
			</span>
		</Component>
	);
}
