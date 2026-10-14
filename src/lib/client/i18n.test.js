import { describe, expect, it } from 'vitest';
import { localizedApiError, translate } from './i18n';

const t = (key, replacements) => translate(key, 'english', replacements);

describe('localizedApiError playground codes', () => {
	it('maps playground-specific codes instead of echoing the server message', () => {
		expect(
			localizedApiError(
				{ code: 'PLAYGROUND_FIELDS_REQUIRED', error: 'A topic is required' },
				t,
				400
			)
		).toBe(translate('errorPlaygroundTopicRequired', 'english'));
		expect(
			localizedApiError(
				{ code: 'PLAYGROUND_FIELDS_TOO_LONG', error: 'The topic or context is too long' },
				t,
				400
			)
		).toBe(translate('errorPlaygroundTooLong', 'english'));
		expect(
			localizedApiError(
				{ code: 'ARTIFACT_INVALID', error: 'The explainer could not be generated. Please retry.' },
				t,
				500
			)
		).toBe(translate('errorExplainerInvalid', 'english'));
		expect(
			localizedApiError({ code: 'EXPLAINER_FAILED', error: 'boom' }, t, 500)
		).toBe(translate('errorExplainerFailed', 'english'));
	});

	it('still falls back to the server message for unknown codes', () => {
		expect(localizedApiError({ code: 'SOMETHING_NEW', error: 'boom' }, t, 500)).toBe('boom');
	});
});
