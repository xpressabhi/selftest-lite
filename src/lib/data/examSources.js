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
// `transport: 'curl-insecure'` exists for servers with incomplete TLS chains
// that Node's fetch refuses (see the per-source comments); it is deliberately
// per-source rather than a process-wide switch. `enabled: false` keeps a known
// source visible in the registry while a transport that can read it is built.
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
		enrichPdfs: true,
		// GitHub's US runners cannot establish a TCP connection to this host
		// with Node's fetch; curl (verified TLS, longer connect timeout) can.
		transport: 'curl',
		// Not reachable from GitHub runners at all (TCP connect times out on
		// both fetch stacks). Fetch it locally with
		// `npm run exams:sync -- --source=upsc`.
		enabled: false
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
		enrichPdfs: true,
		transport: 'fetch',
		enabled: true
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
		enrichPdfs: false,
		// The server sends an incomplete TLS chain that Node/OpenSSL rejects
		// (ERR_SSL_UNEXPECTED_MESSAGE); curl with insecure verification reads
		// the public listing page. Only this source's own hosts are affected.
		transport: 'curl-insecure',
		enabled: true
	},
	{
		id: 'sbi',
		org: 'State Bank of India',
		category: 'banking',
		state: null,
		// The landing page carries no notices; current-openings is
		// client-rendered. Disabled until a rendering transport exists.
		listingUrls: ['https://sbi.bank.in/web/careers'],
		allowedHosts: ['sbi.bank.in', 'sbi.co.in'],
		examIds: ['sbi-po', 'sbi-clerk'],
		linkHint: '',
		enrichPdfs: false,
		transport: 'fetch',
		enabled: false
	},
	{
		id: 'rbi',
		org: 'Reserve Bank of India',
		category: 'banking',
		state: null,
		listingUrls: ['https://opportunities.rbi.org.in/Scripts/Vacancies.aspx'],
		allowedHosts: ['opportunities.rbi.org.in', 'rbi.org.in'],
		examIds: ['rbi-assistant', 'rbi-grade-b'],
		linkHint: '',
		enrichPdfs: false,
		transport: 'fetch',
		enabled: true
	},
	{
		id: 'aiims',
		org: 'All India Institute of Medical Sciences (AIIMS)',
		category: 'health',
		state: null,
		listingUrls: ['https://www.aiims.edu/index.php/en/notices/recruitment/aiims-recruitment'],
		allowedHosts: ['aiims.edu'],
		examIds: [],
		linkHint:
			'Dated recruitment notices for posts such as Pharmacist, Nursing Officer and Technician, each with a PDF or detail link.',
		enrichPdfs: false,
		transport: 'fetch',
		enabled: true
	},
	{
		id: 'esic',
		org: "Employees' State Insurance Corporation (ESIC)",
		category: 'health',
		state: null,
		listingUrls: ['https://esic.gov.in/recruitments'],
		allowedHosts: ['esic.gov.in'],
		examIds: ['esic-udc', 'esic-sso'],
		linkHint:
			'A language-selection overlay precedes the page; the recruitment notices are listed below it.',
		enrichPdfs: false,
		transport: 'fetch',
		// GitHub runners cannot connect to esic.gov.in (verified: fetch
		// UND_ERR_CONNECT_TIMEOUT, curl connect timeout). Local-only.
		enabled: false
	},
	{
		id: 'jipmer',
		org: 'Jawaharlal Institute of Postgraduate Medical Education & Research (JIPMER)',
		category: 'health',
		state: null,
		listingUrls: ['https://jipmer.edu.in/announcements'],
		allowedHosts: ['jipmer.edu.in'],
		examIds: [],
		linkHint: 'Announcements mix academics and recruitment; keep only recruitment notices.',
		enrichPdfs: false,
		// Incomplete TLS chain (same class as BPSC): Node cannot verify the leaf.
		transport: 'curl-insecure',
		enabled: true
	},
	{
		id: 'tnpsc',
		org: 'Tamil Nadu Public Service Commission',
		category: 'state-govt',
		state: 'Tamil Nadu',
		listingUrls: ['https://www.tnpsc.gov.in/'],
		allowedHosts: ['tnpsc.gov.in'],
		examIds: ['tnpsc-group-1-prelims', 'tnpsc-group-2', 'tnpsc-group-4'],
		linkHint: '',
		enrichPdfs: false,
		transport: 'fetch',
		// GitHub runners cannot connect to tnpsc.gov.in; local-only.
		enabled: false
	},
	{
		id: 'kerala-psc',
		org: 'Kerala Public Service Commission',
		category: 'state-govt',
		state: 'Kerala',
		listingUrls: ['https://www.keralapsc.gov.in/notifications'],
		allowedHosts: ['keralapsc.gov.in'],
		examIds: ['kerala-psc-degree-level', 'kerala-psc-10th-level'],
		linkHint: '',
		enrichPdfs: false,
		transport: 'fetch',
		enabled: true
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
		linkHint:
			'Notices are grouped under "Recruitment (CENs)" by CEN number (e.g. 03/2026). Each CEN carries links labelled Notification, Application (Special Notice), Exam Schedule and more; report the latest Notice/Notification link per CEN as that CEN’s notification.',
		enrichPdfs: false,
		// Same reachability problem as UPSC from GitHub's US runners;
		// local-only (`--source=rrb-chandigarh`).
		transport: 'curl',
		enabled: false
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
		enrichPdfs: false,
		transport: 'fetch',
		enabled: true
	},
	{
		id: 'bpsc',
		org: 'Bihar Public Service Commission',
		category: 'state-govt',
		state: 'Bihar',
		listingUrls: ['https://bpsc.bihar.gov.in/'],
		allowedHosts: ['bpsc.bihar.gov.in'],
		examIds: ['bpsc-cce-prelims'],
		linkHint: '',
		enrichPdfs: false,
		// Same incomplete-chain problem as IBPS: Node cannot verify the leaf,
		// curl reads the public listing page.
		transport: 'curl-insecure',
		enabled: true
	},
	{
		id: 'employment-news',
		org: 'Employment News (Ministry of Information & Broadcasting)',
		category: null,
		state: null,
		// The homepage is boilerplate; recruitment ads live inside each weekly
		// issue, which needs a rendering/PDF transport. Disabled until then.
		listingUrls: ['https://employmentnews.gov.in/NewEmp/Home.aspx'],
		allowedHosts: ['employmentnews.gov.in'],
		examIds: [],
		linkHint: '',
		enrichPdfs: false,
		transport: 'fetch',
		enabled: false
	},
	{
		id: 'ncs',
		org: 'National Career Service (Ministry of Labour & Employment)',
		category: null,
		state: null,
		// Fully client-rendered SPA: the fetched HTML carries no listing text.
		// Disabled until a rendering transport exists.
		listingUrls: ['https://ncs.gov.in/latest-update'],
		allowedHosts: ['ncs.gov.in'],
		examIds: [],
		linkHint: '',
		enrichPdfs: false,
		transport: 'fetch',
		enabled: false
	}
];

export function getExamSource(sourceId) {
	return EXAM_SOURCES.find((source) => source.id === sourceId) ?? null;
}

export function examSourceIds() {
	return EXAM_SOURCES.map((source) => source.id);
}

/** Sources the daily sync actually fetches. */
export function enabledExamSources() {
	return EXAM_SOURCES.filter((source) => source.enabled !== false);
}

/** Hosts whose links are read with insecure curl (incomplete TLS chains). */
export function insecureFetchHosts() {
	return EXAM_SOURCES.filter((source) => source.transport === 'curl-insecure').flatMap(
		(source) => source.allowedHosts
	);
}
