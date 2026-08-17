import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Published at https://drortrz.github.io — a GitHub user site, so the repo
  // must be named drortrz.github.io and the content is served from the domain
  // root. No `base` is needed; internal links still go through withBase() in
  // src/utils/url.ts, which resolves to a no-op here and means a move back to
  // a sub-path would only touch this file.
  site: 'https://drortrz.github.io',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    domains: [],
  },
});
