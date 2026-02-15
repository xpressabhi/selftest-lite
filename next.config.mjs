import withPWA from 'next-pwa';
import withBundleAnalyzer from '@next/bundle-analyzer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Your existing Next.js config
	turbopack: {
		root: __dirname,
	},
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
