import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* One markdown file per piece. Editors add a file and the home grid, the section
   pages and the archive pick it up — nothing about a piece lives in markup. */
const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    standfirst: z.string(),
    section: z.enum(['film', 'music', 'literature', 'culture', 'build-it']),
    /* The finer flag printed above the headline, e.g. "Essay / Film". Falls back
       to the section name when absent. */
    kicker: z.string().optional(),
    author: z.string(),
    role: z.string().optional(),
    date: z.coerce.date(),
    issue: z.string(),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    imageCredit: z.string().optional(),
    readingTime: z.string().optional(),
    tags: z.array(z.string()).default([]),
    /* The one piece that takes the full-bleed opener on the issue page. */
    featured: z.boolean().default(false),
  }),
});

export const collections = { articles };
