// Curated official sources for the exam notification tracker.
//
// Every entry is a human-reviewed official listing page (or official JSON
// feed). The sync script fetches these URLs only; Gemini is asked to read the
// page and extract notifications, and every extracted link must land on one of
// the source's allowed hosts (final URL after redirects) or it is quarantined.
//
// `examIds` are the practice-registry exams this source is expected to feed;
// they scope the extraction prompt and give deterministic practice CTAs.
// `linkHint` is prompt-only guidance for sources that publish attachments as
// relative paths. `enrichPdfs` marks sources whose notices are PDF-only.
//
// Growing this list is the intended way to widen coverage (see
// docs/superpowers/specs/2026-09-26-exam-notification-tracker-design.md);
// AI-discovered candidates are suggestions, never auto-fetched.

export const EXAM_SOURCES = [
	{
		id: 'upsc',
		org: 'Union Public Service Commission',
		category: 'civil-services',
		state: null,
		listingUrls: ['https://upsc.gov.in/whats-new'],
		allowedHosts: ['upsc.gov.in'],
		examIds: [
			'upsc-cse-prelims',
			'upsc-ifos-prelims',
			'upsc-capf-ac',
			'upsc-cds',
			'nda',
			'upsc-cms'
		],
		linkHint: '',
		enrichPdfs: true
	},
	{
		id: 'ssc',
		org: 'Staff Selection Commission',
		category: 'ssc-central',
		state: null,
		// Official JSON feed used by ssc.gov.in itself; limit=30 keeps the run
		// small while covering several weeks of notices.
		listingUrls: [
			'https://ssc.gov.in/api/general-website/portal/notice-boards?page=1&limit=30&contentType=notice-boards&key=createdAt&order=DESC&isAttachment=true&language=english&attributes=id,headline,examId,contentType,redirectUrl,startDate,endDate,language,createdAt'
		],
		allowedHosts: ['ssc.gov.in'],
		examIds: [
			'ssc-cgl',
			'ssc-chsl',
			'ssc-mts',
			'ssc-gd-constable',
			'ssc-stenographer-cd',
			'ssc-selection-post',
			'ssc-cpo-si'
		],
		linkHint:
			'Attachment paths in the JSON are relative to https://ssc.gov.in/api/attachment/ and use backslashes; build full https://ssc.gov.in URLs from them.',
		enrichPdfs: true
	},
	{
		id: 'ibps',
		org: 'Institute of Banking Personnel Selection',
		category: 'banking',
		state: null,
		listingUrls: ['https://www.ibps.in/index.php/recruitment/'],
		allowedHosts: ['ibps.in'],
		examIds: ['ibps-po', 'ibps-clerk', 'epfo-ssa', 'epfo-eo-ao', 'esic-udc', 'esic-sso'],
		linkHint: '',
		enrichPdfs: false
	},
	{
		id: 'rrb-chandigarh',
		org: 'Railway Recruitment Board (Chandigarh)',
		category: 'railways',
		state: null,
		listingUrls: ['https://rrb.indianrailways.gov.in/chandigarh'],
		allowedHosts: ['rrb.indianrailways.gov.in', 'indianrailways.gov.in'],
		examIds: [
			'rrb-ntpc-graduate',
			'rrb-ntpc-undergraduate',
			'rrb-group-d',
			'rrb-alp',
			'rrb-je',
			'rrb-technician',
			'rpf-si',
			'rpf-constable'
		],
		linkHint: '',
		enrichPdfs: false
	},
	{
		id: 'uppsc',
		org: 'Uttar Pradesh Public Service Commission',
		category: 'state-govt',
		state: 'Uttar Pradesh',
		listingUrls: ['https://uppsc.up.nic.in/'],
		allowedHosts: ['uppsc.up.nic.in'],
		examIds: ['uppsc-pcs-prelims'],
		linkHint: '',
		enrichPdfs: false
	},
	{
		id: 'bpsc',
		org: 'Bihar Public Service Commission',
		category: 'state-govt',
		state: 'Bihar',
		listingUrls: ['https://bpsc.bihar.gov.in/advertisement/'],
		allowedHosts: ['bpsc.bihar.gov.in'],
		examIds: ['bpsc-cce-prelims'],
		linkHint: '',
		enrichPdfs: false
	},
	{
		id: 'employment-news',
		org: 'Employment News (Ministry of Information & Broadcasting)',
		category: null,
		state: null,
		// The government's own weekly recruitment bulletin; a broad official
		// net for departments and PSUs outside the curated commissions.
		listingUrls: ['https://employmentnews.gov.in/NewEmp/Home.aspx'],
		allowedHosts: ['employmentnews.gov.in'],
		examIds: [],
		linkHint: '',
		enrichPdfs: false
	},
	{
		id: 'ncs',
		org: 'National Career Service (Ministry of Labour & Employment)',
		category: null,
		state: null,
		listingUrls: ['https://ncs.gov.in/latest-update'],
		allowedHosts: ['ncs.gov.in'],
		examIds: [],
		linkHint: 'Items may link to documents on *.blob.core.windows.net; prefer the ncs.gov.in page link when both exist.',
		enrichPdfs: false
	}
];

export function getExamSource(sourceId) {
	return EXAM_SOURCES.find((source) => source.id === sourceId) ?? null;
}

export function examSourceIds() {
	return EXAM_SOURCES.map((source) => source.id);
}
