import React from 'react';

// Centralized SVG icon registry. Keep all original path definitions here.
const ICONS = {
	history: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z' />
			<path d='M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z' />
			<path d='M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5' />
		</svg>
	),
	trash: (props) => (
		<svg viewBox='0 0 16 16' fill='currentColor' aria-hidden {...props}>
			<path d='M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5M8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5m3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0' />
		</svg>
	),
	clock: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-4V7h2v4h2v2z' />
		</svg>
	),
	trophy: (props) => (
		<svg viewBox='0 0 16 16' fill='currentColor' aria-hidden {...props}>
			<path d='M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5q0 .807-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33 33 0 0 1 2.5.5m.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935m10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935' />
		</svg>
	),
	chevronRight: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M9 6l6 6-6 6' />
		</svg>
	),
	sparkles: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.73 1.73 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.73 1.73 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.73 1.73 0 0 0 3.407 2.31zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.16 1.16 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.16 1.16 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732z' />
		</svg>
	),
	info: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' />
		</svg>
	),
	book: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M6 4v16a2 2 0 002 2h10V4H8a2 2 0 00-2 0zM20 4v16h2V4h-2z' />
		</svg>
	),
	bookOpen: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783' />
		</svg>
	),
	question: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm1.07-7.75c-.9.92-1.07 1.36-1.07 3h-2v-.5c0-1 .25-1.5 1.17-2.41.73-.74 1.33-1.24 1.33-2.09 0-1.1-.9-2-2-2s-2 .9-2 2H9c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.2-.5 1.92-1.93 3.25z' />
		</svg>
	),
	envelope: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z' />
		</svg>
	),
	file: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z' />
		</svg>
	),
	print: (props) => (
		<svg fill='currentColor' viewBox='0 0 16 16' aria-hidden {...props}>
			<path d='M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1' />
			<path d='M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1' />
		</svg>
	),
	close: (props) => (
		<svg viewBox='0 0 24 24' fill='none' aria-hidden {...props}>
			<path
				d='M18 6L6 18M6 6l12 12'
				stroke='currentColor'
				strokeWidth='2'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	),
	share: (props) => (
		<svg fill='currentColor' viewBox='0 0 16 16' aria-hidden {...props}>
			<path d='M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.5 2.5 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5' />
		</svg>
	),
	play: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M8 5v14l11-7z' />
		</svg>
	),
	exclamation: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M1 21h22L12 2 1 21zm13-3h-4v-2h4v2zm0-4h-4v-4h4v4z' />
		</svg>
	),
	home: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z' />
		</svg>
	),
	circle: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16' />
		</svg>
	),
	filledCircle: (props) => (
		<svg fill='currentColor' viewBox='0 0 16 16' aria-hidden {...props}>
			<circle cx='8' cy='8' r='8' />
		</svg>
	),
	checkCircle: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm-1 14l-4-4 1.5-1.5L11 12.5 17.5 6 19 7.5 11 15z' />
		</svg>
	),
	timesCircle: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm4.3 13.3L13.3 12l3-3-1.4-1.4-3 3-3-3L7.5 9l3 3-3 3L8.9 16l3-3 3 3 1.4-1.4z' />
		</svg>
	),
	spinner: (props) => (
		<svg viewBox='0 0 50 50' fill='currentColor' aria-hidden {...props}>
			<path d='M25 5a20 20 0 100 40 20 20 0 000-40zm0 4a16 16 0 110 32 16 16 0 010-32z' />
		</svg>
	),
	exclamationCircle: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M11 9h2v6h-2V9zm0-4h2v2h-2V5zm1-3a10 10 0 100 20 10 10 0 000-20z' />
		</svg>
	),
	pencil: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' />
		</svg>
	),
	plusCircle: (props) => (
		<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden {...props}>
			<path d='M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z' />
		</svg>
	),
	repeat1: (props) => (
		<svg fill='currentColor' viewBox='0 0 16 16' aria-hidden {...props}>
			<path d='M11 4v1.466a.25.25 0 0 0 .41.192l2.36-1.966a.25.25 0 0 0 0-.384l-2.36-1.966a.25.25 0 0 0-.41.192V3H5a5 5 0 0 0-4.48 7.223.5.5 0 0 0 .896-.446A4 4 0 0 1 5 4zm4.48 1.777a.5.5 0 0 0-.896.446A4 4 0 0 1 11 12H5.001v-1.466a.25.25 0 0 0-.41-.192l-2.36 1.966a.25.25 0 0 0 0 .384l2.36 1.966a.25.25 0 0 0 .41-.192V13h6a5 5 0 0 0 4.48-7.223Z' />
			<path d='M9 5.5a.5.5 0 0 0-.854-.354l-1.75 1.75a.5.5 0 1 0 .708.708L8 6.707V10.5a.5.5 0 0 0 1 0z' />
		</svg>
	),
	lightbulb: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M2 6a6 6 0 1 1 10.174 4.31c-.203.196-.359.4-.453.619l-.762 1.769A.5.5 0 0 1 10.5 13a.5.5 0 0 1 0 1 .5.5 0 0 1 0 1l-.224.447a1 1 0 0 1-.894.553H6.618a1 1 0 0 1-.894-.553L5.5 15a.5.5 0 0 1 0-1 .5.5 0 0 1 0-1 .5.5 0 0 1-.46-.302l-.761-1.77a2 2 0 0 0-.453-.618A5.98 5.98 0 0 1 2 6m6-5a5 5 0 0 0-3.479 8.592c.263.254.514.564.676.941L5.83 12h4.342l.632-1.467c.162-.377.413-.687.676-.941A5 5 0 0 0 8 1' />
		</svg>
	),
	wifiOff: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M10.706 3.294A12.545 12.545 0 0 0 8 3C5.259 3 2.723 3.882.663 5.379a.485.485 0 0 0-.048.736.518.518 0 0 0 .668.05A11.448 11.448 0 0 1 8 4c.63 0 1.249.05 1.852.148l.854-.854zM8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065 8.448 8.448 0 0 1 3.51-1.27L8 6zm2.596 1.404l.785-.785c.63.24 1.227.545 1.785.907a.482.482 0 0 1 .063.745.525.525 0 0 1-.652.065 8.462 8.462 0 0 0-1.98-.932zM8 10l.933-.933a6.455 6.455 0 0 1 2.013.637.482.482 0 0 1 .063.745.525.525 0 0 1-.652.065A5.478 5.478 0 0 0 8 10zm4.905-4.905l.747-.747c.59.3 1.153.645 1.685 1.03a.485.485 0 0 1 .048.737.518.518 0 0 1-.668.05 11.496 11.496 0 0 0-1.812-1.07zM9.02 11.78c.238.14.236.464.04.66l-.707.706a.5.5 0 0 1-.707 0l-.707-.707c-.195-.195-.197-.518.04-.66A1.99 1.99 0 0 1 8 11.5c.374 0 .723.102 1.021.28zm4.355-9.905a.53.53 0 0 1 .75.75l-10.75 10.75a.53.53 0 0 1-.75-.75l10.75-10.75z' />
		</svg>
	),
	signal: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M0 11.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-8zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-11z' />
		</svg>
	),
	inbox: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M4.98 4a.5.5 0 0 0-.39.188L1.54 8H6a.5.5 0 0 1 .5.5 1.5 1.5 0 1 0 3 0A.5.5 0 0 1 10 8h4.46l-3.05-3.812A.5.5 0 0 0 11.02 4H4.98zm-1.17-.437A1.5 1.5 0 0 1 4.98 3h6.04a1.5 1.5 0 0 1 1.17.563l3.7 4.625a.5.5 0 0 1 .106.374l-.39 3.124A1.5 1.5 0 0 1 14.117 13H1.883a1.5 1.5 0 0 1-1.489-1.314l-.39-3.124a.5.5 0 0 1 .106-.374l3.7-4.625z' />
		</svg>
	),
	chevronUp: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path fillRule='evenodd' d='M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z' />
		</svg>
	),
	chevronDown: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path fillRule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z' />
		</svg>
	),
	moon: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278' />
		</svg>
	),
	sun: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z' />
		</svg>
	),
	star: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z' />
		</svg>
	),
	starFill: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z' />
		</svg>
	),
	bookmark: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.777.416L8 13.101l-5.223 2.815A.5.5 0 0 1 2 15.5V2zm2-1a1 1 0 0 0-1 1v12.566l4.723-2.482a.5.5 0 0 1 .554 0L13 14.566V2a1 1 0 0 0-1-1H4z' />
		</svg>
	),
	list: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path fillRule='evenodd' d='M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5' />
		</svg>
	),
	bookmarkFill: (props) => (
		<svg aria-hidden {...props} fill='currentColor' viewBox='0 0 16 16'>
			<path d='M2 2v13.5a.5.5 0 0 0 .74.439L8 13.069l5.26 2.87A.5.5 0 0 0 14 15.5V2a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z' />
		</svg>
	),
};

export default function Icon({ name, className, style, size, ...rest }) {
	const iconFactory = ICONS[name];
	if (!iconFactory) return null;

	// Default behavior: inherit size and color from parent.
	// - If `size` is not provided, use '1em' so the SVG scales with font-size.
	// - If `size` is a number, treat it as pixels (e.g. 16 -> '16px').
	// - If `size` is a string, pass it through (e.g. '24px', '1.5em', '2rem').
	let svgSize = null;
	if (size == null) {
		svgSize = '1em';
	} else if (typeof size === 'number') {
		svgSize = `${size}px`;
	} else if (typeof size === 'string') {
		svgSize = size;
	}

	const svgProps = {};
	if (svgSize) {
		svgProps.width = svgSize;
		svgProps.height = svgSize;
	}

	// Icons use `fill="currentColor"` (and `stroke="currentColor"` where needed)
	// so they inherit color from the parent by default.
	return (
		<span
			className={className}
			style={{ display: 'inline-flex', lineHeight: '1', ...style }}
			{...rest}
		>
			{iconFactory(svgProps)}
		</span>
	);
}
