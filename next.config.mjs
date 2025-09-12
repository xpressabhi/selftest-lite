import withPWA from 'next-pwa';
import withBundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Your existing Next.js config
	experimental: {
		optimizePackageImports: ['react-bootstrap'],
	},
};

// Create bundle analyzer wrapper
const withAnalyzer = withBundleAnalyzer({
	enabled: process.env.ANALYZE === 'true',
});

// Create PWA wrapper
const withPWAConfig = withPWA({
	dest: 'public',
	register: true,
	skipWaiting: true,
});

// Compose configurations
const config = withPWAConfig(withAnalyzer(nextConfig));

export default config;
