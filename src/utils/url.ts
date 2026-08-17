// Internal links go through here so the site is not tied to living at the
// domain root.
//
// It is a no-op today: the site is published at https://drortrz.github.io,
// a user site with no `base`, so BASE_URL is "/". Set `base` in
// astro.config.mjs — moving to a project repo, or serving from a sub-folder —
// and every link picks up the prefix without another file being touched.

const BASE = import.meta.env.BASE_URL;

/**
 * Prefix an internal path with the site's base.
 *
 * @example withBase('/projects/cebatero') // '/dror-trzewik-portfolio/projects/cebatero'
 * @example withBase('/#work')             // '/dror-trzewik-portfolio/#work'
 */
export function withBase(path: string): string {
  // Leave anything already absolute alone: mailto:, https://, and the like.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path;

  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const rest = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rest}`;
}
