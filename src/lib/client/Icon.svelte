<script>
	// One local stroke-icon family for the whole app (AGENTS.md: icons come from
	// a local Svelte component, not a dependency). 24px grid, round caps/joins,
	// single stroke width so every icon reads as the same hand.
	//
	// Usage: <Icon name="home" /> / <Icon name="sun" size={18} />
	// Icons are decorative by default (aria-hidden); pass `label` to expose one
	// to assistive tech as an image.

	const ICONS = {
		home: ['M4 10.5 12 4l8 6.5', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
		bookmark: ['M7 4.5h10V20l-5-3.6L7 20Z'],
		plus: ['M12 5v14M5 12h14'],
		clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z', 'M12 7.5V12l3 1.8'],
		menu: ['M4 7h16M4 12h16M4 17h16'],
		close: ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
		user: ['M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
		login: [
			'M10.5 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4.5',
			'M14.5 8.5 18 12l-3.5 3.5',
			'M18 12H9.5'
		],
		logout: [
			'M13.5 5H18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4.5',
			'M9.5 8.5 6 12l3.5 3.5',
			'M6 12h8.5'
		],
		sun: [
			'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z',
			'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4'
		],
		moon: ['M20 14.8A8.5 8.5 0 0 1 9.2 4 8.5 8.5 0 1 0 20 14.8Z'],
		globe: [
			'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z',
			'M3.5 12h17',
			'M12 3.5c2.3 2.3 3.6 5.4 3.6 8.5s-1.3 6.2-3.6 8.5c-2.3-2.3-3.6-5.4-3.6-8.5S9.7 5.8 12 3.5Z'
		],
		gauge: ['M4.5 15a7.5 7.5 0 0 1 15 0', 'M12 15l3.5-3', 'M4 19.5h16'],
		search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'M15.5 15.5 20 20'],
		trash: ['M5 7h14', 'M9.5 7V5h5v2', 'M7 7l1 13h8l1-13', 'M10.5 11v5M13.5 11v5'],
		star: ['M12 4.5l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 10l5.2-.8z'],
		chart: ['M5 20V11M12 20V4M19 20v-6'],
		check: ['M5 12.5l4.5 4.5L19 7'],
		x: ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
		'chevron-down': ['M6.5 9.5 12 15l5.5-5.5'],
		'chevron-up': ['M6.5 14.5 12 9l5.5 5.5'],
		'chevron-right': ['M9.5 6.5 15 12l-5.5 5.5'],
		'chevron-left': ['M14.5 6.5 9 12l5.5 5.5'],
		'arrow-left': ['M19 12H5.5', 'M11.5 6.5 6 12l5.5 5.5'],
		'arrow-right': ['M5 12h13.5', 'M12.5 6.5 18 12l-5.5 5.5'],
		alert: ['M12 4.5 21 19H3z', 'M12 10v4', 'M12 16.5h.01'],
		info: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z', 'M12 11v5', 'M12 8h.01'],
		refresh: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
		print: [
			'M7.5 9V4.5h9V9',
			'M7.5 17H5.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2',
			'M7.5 14h9v5.5h-9z'
		],
		share: ['M12 15V4', 'M8.5 7.5 12 4l3.5 3.5', 'M5.5 13v6.5h13V13'],
		download: ['M12 4v10', 'M8.5 10.5 12 14l3.5-3.5', 'M5 19.5h14'],
		edit: ['M4.5 19.5l3.8-.75L19 8a2 2 0 0 0-2.83-2.83L5.4 15.7z', 'M14.5 7.5l2 2'],
		filter: ['M4.5 6.5h15M7.5 12h9M10.5 17.5h3'],
		external: ['M14 5.5h4.5V10', 'M18.5 5.5 11 13', 'M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5'],
		book: ['M6 4.5h12V20H7.5A1.5 1.5 0 0 1 6 18.5z', 'M6 18.5A1.5 1.5 0 0 1 7.5 17H18'],
		shield: ['M12 3.5 18.5 6v5c0 4.2-2.7 7.6-6.5 9.5-3.8-1.9-6.5-5.3-6.5-9.5V6z'],
		zap: ['M13 3.5 5.5 13H11l-1 7.5L17.5 11H12z'],
		target: [
			'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z',
			'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z',
			'M12 12h.01'
		],
		flag: ['M6.5 21V4', 'M6.5 5h11l-2.2 3.5L17.5 12h-11'],
		note: ['M7 3.5h7l4 4V20.5H7z', 'M14 3.5v4h4', 'M9.5 12h6M9.5 15.5h6'],
		'thumb-up': [
			'M7.5 11 11 4.5a1.8 1.8 0 0 1 1.8 1.8V9h5a1.8 1.8 0 0 1 1.8 2.1l-1 5A1.8 1.8 0 0 1 17 17.5H7.5',
			'M7.5 11v6.5',
			'M4 11h3.5v6.5H4z'
		],
		'thumb-down': [
			'M7.5 13 11 19.5a1.8 1.8 0 0 0 1.8-1.8V15h5a1.8 1.8 0 0 0 1.8-2.1l-1-5A1.8 1.8 0 0 0 17 6.5H7.5',
			'M7.5 13V6.5',
			'M4 6.5h3.5V13H4z'
		],
		sparkle: ['M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6z'],
		leaf: ['M19 5C10.5 5.5 6 10 6 17.5V19c0 0 7 .5 11-5.5C19.5 10 19 5 19 5Z', 'M6 19c3-4 6.5-7 10-9'],
		flame: [
			'M12 3.5c3.5 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-10.5Z',
			'M12 12c1.7 2 2.5 3.2 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.3.8-2.5 2.5-4.5Z'
		],
		gem: ['M6.5 4.5h11L21 10 12 20 3 10z', 'M3 10h18', 'M9 4.5 7.5 10 12 20M15 4.5l1.5 5.5L12 20'],
		crown: ['M4 18h16', 'M4.5 8.5 8 12l4-5.5 4 5.5 3.5-3.5-1.5 7H6z'],
		mail: [
			'M5 6.5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z',
			'M4.5 7.5 12 13l7.5-5.5'
		],
		sliders: [
			'M4 8h9M17 8h3M4 16h3M11 16h9',
			'M15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
			'M9 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4'
		],
		list: ['M8 6.5h12M8 12h12M8 17.5h12', 'M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01'],
		lock: [
			'M7 10.5h10a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
			'M9 10.5V8a3 3 0 0 1 6 0v2.5'
		],
		minus: ['M5 12h14'],
		code: ['M9 8 5 12l4 4M15 8l4 4-4 4'],
		link: [
			'M10 14l4-4',
			'M7.5 11.5 5 14a3.5 3.5 0 0 0 5 5l2.5-2.5',
			'M16.5 12.5 19 10a3.5 3.5 0 0 0-5-5l-2.5 2.5'
		],
		scale: [
			'M12 4.5v15',
			'M8 19.5h8',
			'M5 8.5h14',
			'M5 8.5a3 3 0 0 0 6 0z',
			'M13 8.5a3 3 0 0 0 6 0z'
		]
	};

	let {
		name,
		size = 20,
		strokeWidth = 1.75,
		label = '',
		class: className = ''
	} = $props();

	let paths = $derived(ICONS[name] ?? []);
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	{#each paths as d (d)}
		<path {d} />
	{/each}
</svg>
