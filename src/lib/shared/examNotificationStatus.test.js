import { describe, expect, it } from 'vitest';
import { notificationDisplayTitle } from './examNotificationStatus.js';

// The card headline is a display-only projection of a scraped title. The
// stored title and its dedupe key are untouched, so every case here is about
// what a student reads on a 320px card, never about identity.
describe('notificationDisplayTitle', () => {
	it('returns an empty string for unusable input', () => {
		expect(notificationDisplayTitle(null)).toBe('');
		expect(notificationDisplayTitle('   ')).toBe('');
	});

	it('picks the Hindi half of a bilingual notice for a Hindi reader', () => {
		const title =
			'निम्नलिखित अस्थायी अनुबंध पदों को भरने हेतु आवेदन आमंत्रित किए जाते हैं, बालरोग चिकित्सा विभाग, एम्स / Applications are invited for filling up the following temporary posts at AIIMS';
		expect(notificationDisplayTitle(title, 'hindi')).toContain('निम्नलिखित');
		expect(notificationDisplayTitle(title, 'hindi')).not.toContain('Applications');
	});

	it('picks the English half for an English reader', () => {
		const title =
			'निम्नलिखित अस्थायी अनुबंध पदों को भरने हेतु आवेदन आमंत्रित किए जाते हैं, बालरोग चिकित्सा विभाग, एम्स / Applications are invited for filling up the following temporary posts at AIIMS';
		expect(notificationDisplayTitle(title, 'english')).toContain('Applications');
		expect(notificationDisplayTitle(title, 'english')).not.toContain('निम्नलिखित');
	});

	it('keeps short titles intact', () => {
		expect(notificationDisplayTitle('SSC CGL 2026 notification')).toBe(
			'SSC CGL 2026 notification'
		);
	});

	it('clamps long titles at a word boundary with an ellipsis', () => {
		const title = 'Recruitment for the post of '.repeat(12);
		const result = notificationDisplayTitle(title, 'english');
		expect(result.length).toBeLessThanOrEqual(91);
		expect(result.endsWith('…')).toBe(true);
		expect(result).not.toMatch(/\s…$/);
	});
});
