# DSIR

The website for **DSIR — The Doon School Information Review**, a student publication at The Doon
School, Dehradun, and its weekly issue, the **DSIR Digest**.

Built from the design handoff in `DSIR_article_page_design.zip`. The prototypes in that bundle were
design references; this is the implementation.

## Stack

[Astro](https://astro.build) 5, static output, no UI framework. Markdown content collections carry
the articles. The only client JavaScript on the site is the intro's canvas island, the archive's
filters and the submissions form's validation.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static site into dist/
npm run preview
npm run check    # astro check — types and template diagnostics
```

Deploy `dist/` to any static host (Netlify, Vercel, GitHub Pages).

## Routes

| Route | Source | What it is |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | The scroll-driven intro on black |
| `/issue/01/` | `src/pages/issue/[issue].astro` | The current issue: full-bleed opener, three-column grid |
| `/article/[slug]/` | `src/pages/article/[slug].astro` | The reader: serif column at a 38em measure |
| `/archive/` | `src/pages/archive.astro` | Every piece, with working search, year, order and section filters |
| `/section/[slug]/` | `src/pages/section/[slug].astro` | One route serving Film, Music, Literature, Culture and Build It |
| `/about/` | `src/pages/about.astro` | Statement and masthead |
| `/submit/` | `src/pages/submit.astro` | The pitch form |

## Design tokens

`src/styles/tokens/*.css` are copied **verbatim** from the handoff's design system and are the source
of truth for colour, type, spacing, rules and motion. They are byte-identical to the originals. Style
against the variables; do not introduce new values.

`src/styles/global.css` imports them in the design system's own order and adds the site layer on top
— page shells, the caps/headline/standfirst scales, the prose column, focus rules and the responsive
reflow. Every number in it is lifted from the prototypes or the tokens.

Three colours only: black `#000000`, white `#FFFFFF`, red `#ED1C24`. Red is an event, not a wash. The
gold in the intro's grain is sampled from the trophy photographs and is the single documented
exception.

## Content model

One Markdown file per piece in `src/content/articles/`. Editors add a file; the home grid, the section
pages and the archive pick it up. Nothing about a piece lives in markup.

```yaml
---
title: "Hollywood's Pedagogical Obsession"
standfirst: "One sentence, lifted from the opening paragraph."
section: film            # film | music | literature | culture | build-it
kicker: "Essay / Film"   # optional finer flag above the headline
author: "Abhir Kohli"
role: "Senior Correspondent"   # optional
date: 2026-09-09
issue: "01"
heroImage: "/images/whatever.jpg"   # optional; omit for the duotone placeholder
heroAlt: "Cinema crowd, 3D glasses."
imageCredit: "IMAGE CREDITS: GQ"
readingTime: "9 min"
tags: ["Film", "Education"]
featured: false          # the one piece that takes the issue's full-bleed opener
---
```

The schema lives in `src/content.config.ts`. Standing data that changes each issue — the masthead,
the section list, back issues, the genre options — lives in `src/data/site.ts`, not in markup.

## The intro

`src/scripts/intro.ts` is the scroll-driven sequence: a 900vh track holding one sticky stage, with a
galaxy phase, four grain fields sampled from real photographs of awards, and seven text overlays.

Every constant is ported from the handoff's motion specification and should be treated as fixed —
the damped scroll follow, the beat windows, the depth maths, the sampling threshold, the gold ramp.
Three things are worth knowing before editing it:

- Elements are looked up by attribute each frame, never held as long-lived refs.
- Exactly one animation loop runs per page; a new claim cancels the previous one, and the draw call
  sits inside a `try` so one bad frame cannot break the frame chain.
- Under `prefers-reduced-motion` it renders **one** static frame and redraws on scroll. No loop is
  ever started, and the restart heartbeat is disabled — the prototype restarted the loop this way.

Every word of the intro is real text in the DOM, so the page reads without canvas or JavaScript.

The intro plays once per reader: it sets `dsir:seen-intro` in `localStorage` and returning readers
are redirected to the current issue. `?replay` forces it; `?skip` skips it and records the flag.

## The submissions form

Fields are Name, House, Form, Genre, Article title, Idea and the "own writing, not generated"
checkbox. Required-field validation runs client-side with inline errors in red and no icons, then the
form posts to a form service.

Set the endpoint before launch:

```bash
cp .env.example .env
# PUBLIC_FORM_ENDPOINT=https://formspree.io/f/xxxxxxx
```

Until it is set, the form validates and then says plainly that it is not connected, rather than
pretending a pitch was sent.

## Accessibility

Keyboard-reachable nav and form, a skip link, headings in order, alt text from frontmatter, and a
visible 2px red focus outline at 2px offset that is never removed. All motion collapses under
`prefers-reduced-motion`.

## Still needed before launch

1. **Article copy.** Only `hollywoods-pedagogical-obsession.md` carries real text, from the
   prototype. The other ten files have their prototype headline, standfirst and byline and say
   plainly that copy has not been filed. No article text has been invented.
2. **Photography.** Every image is a red duotone placeholder. Add `heroImage` to the frontmatter and
   the placeholders drop out.
3. **The opener's byline.** The prototype's full-bleed opener, "Our eloquent hands", carried no
   byline; it is attributed to the Editor-in-Chief as a placeholder.
4. **Trophy photograph licensing.** `public/intro/` holds three stock images used to prototype the
   grain effect. They carry faint watermarks, which the sampler thresholds out, but they need to be
   licensed or replaced. A clean image samples better.
5. **An Emmy photograph.** The Culture beat uses a drawn television silhouette because no trophy
   image was available. An Emmy photograph drops straight into the same sampler.
6. **The editorial serif.** Newsreader stands in for a licensed transitional face. Swapping it is a
   one-line change in `src/styles/tokens/typography.css`.
7. **Sections vs. the footer.** The handoff's content model lists five sections (film, music,
   literature, culture, build-it) while the design system's footer listed "Sport" as a sixth. The five
   are canonical here and the footer renders from that data; the two "Sport" and "In Memory Of"
   pieces carry those labels as kickers. Worth a decision either way.
