import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import pwa from '@vite-pwa/astro';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), pwa()],
  markdown: {
    remarkPlugins: [remarkMath, remarkGfm],
    rehypePlugins: [rehypeRaw, rehypeKatex],
    syntaxHighlight: 'prism',
  },
});
