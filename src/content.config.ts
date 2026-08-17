import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  // The glob loader derives ids from filenames without the extension, so URLs
  // are /projects/pottymon rather than /projects/pottymon.md.
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.date(),
      tags: z.array(z.string()),
      role: z.string().optional(),
      // Techniques and processes, shown on the project page.
      tools: z.array(z.string()).optional(),
      // Named applications, matched against the pills in the About section so
      // hovering a tool shows what was made with it. Kept apart from `tools`
      // because that list is prose for the reader, while this one has to match
      // the pill labels exactly to link anything up.
      software: z.array(z.string()).optional(),
      cover: image(),
      // Falls back to the project title when omitted. Set it when the cover
      // carries meaning the title doesn't convey (e.g. an award certificate).
      coverAlt: z.string().optional(),
      // Optional square crop for the small home-page thumbnail. Use when the
      // automatic centre crop of the cover loses what matters at that size.
      thumb: image().optional(),
      // Ordered gallery images rendered in a fixed grid below the case study.
      // `span: 2` makes an image take the full grid width.
      gallery: z
        .array(
          z.object({
            src: image(),
            alt: z.string(),
            span: z.number().min(1).max(2).default(1),
            // Halves the item's base width so more of them share a row —
            // for supporting material like sketch sheets, which shouldn't
            // occupy the same weight as a finished render.
            small: z.boolean().default(false),
          })
        )
        .optional(),
      featured: z.boolean().default(false),
      order: z.number().default(0),
      externalUrl: z.string().url().optional(),
    }),
});

export const collections = { projects };
