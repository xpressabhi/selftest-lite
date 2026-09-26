// Best-effort HTML → text conversion for the notification sync. The model
// only ever sees this text plus the numbered link list, so this module is the
// security-relevant read path: scripts, styles and unsafe link schemes must
// not survive, and every link is resolved against the page URL so the
// extractor can copy real absolute URLs.
//
// Not a sanitizer for rendering: nothing here is ever shown to users.

const DANGEROUS_BLOCKS =
	/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<noscript\b[^>]*>[\s\S]*?<\/noscript>|<template\b[^>]*>[\s\S]*?<\/template>|<svg\b[^>]*>[\s\S]*?<\/svg>|<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi;

const BLOCK_TAGS =
	/<\/?(?:p|div|br|li|ul|ol|dl|dt|dd|tr|td|th|table|thead|tbody|h[1-6]|section|article|header|footer|nav|main|form|label|option|select|textarea|button|fieldset|blockquote|pre|hr|address)\b[^>]*>/gi;

const ANCHOR = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

const NEWLINE_SENTINEL = '\u0000';

function decodeEntities(value) {
	return value
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&#x0*27;/gi, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(hex, 16))
		.replace(/&#(\d+);/g, (_, decimal) => safeCodePoint(decimal, 10));
}

function safeCodePoint(raw, radix) {
	const code = Number.parseInt(raw, radix);
	if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
		return '';
	}
	try {
		return String.fromCodePoint(code);
	} catch {
		return '';
	}
}

function inlineLabel(html) {
	return decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

function collectLinks(html, baseUrl, maxLinks) {
	const links = [];
	const seen = new Set();
	for (const match of html.matchAll(ANCHOR)) {
		if (links.length >= maxLinks) {
			break;
		}
		const rawHref = match[1] ?? match[2] ?? match[3] ?? '';
		const href = rawHref.trim();
		if (!href || href.startsWith('#')) {
			continue;
		}
		let resolved;
		try {
			resolved = baseUrl ? new URL(href, baseUrl) : new URL(href);
		} catch {
			continue;
		}
		if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
			continue;
		}
		const normalized = resolved.toString();
		if (seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		links.push({ href: normalized, label: inlineLabel(match[4]) });
	}
	return links;
}

/**
 * @param {string} html
 * @param {{ baseUrl?: string, maxChars?: number, maxLinks?: number }} options
 * @returns {{ text: string, links: Array<{ href: string, label: string }> }}
 */
export function htmlToText(html, { baseUrl = '', maxChars = 40000, maxLinks = 200 } = {}) {
	if (typeof html !== 'string' || html.length === 0) {
		return { text: '', links: [] };
	}

	const links = collectLinks(html, baseUrl, maxLinks);

	const visible = html
		.replace(DANGEROUS_BLOCKS, ' ')
		.replace(BLOCK_TAGS, NEWLINE_SENTINEL)
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		// Raw newlines are whitespace; only the block sentinel makes a line.
		.split(NEWLINE_SENTINEL)
		.map((line) =>
			decodeEntities(line)
				.replace(/\s+/g, ' ')
				.trim()
		)
		.filter(Boolean)
		.join('\n')
		.slice(0, maxChars);

	const linkLines = links.map(
		(link, index) => `[${index + 1}] ${link.label || 'link'} — ${link.href}`
	);
	const text = linkLines.length > 0 ? `${visible}\n\nLINKS:\n${linkLines.join('\n')}` : visible;

	return { text, links };
}
