import withPWA from 'next-pwa';
import { join } from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing Next.js config
};

export default withPWA({
  ...nextConfig,
  pwa: {
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development'
  }
});
