import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
	...nextCoreWebVitals,
	{
		rules: {
			'import/no-anonymous-default-export': 'off',
			'react/no-unescaped-entities': 'off',
			'react-hooks/immutability': 'off',
			'react-hooks/purity': 'off',
			'react-hooks/set-state-in-effect': 'off',
		},
	},
];

export default eslintConfig;
