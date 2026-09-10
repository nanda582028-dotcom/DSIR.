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

`src/scripts/intro.ts` is the scroll-driven sequence: a 900vh track holding one sticky stage, with
seven text overlays over one canvas. It has three phases.

**Phase A (p 0 → ~0.34) — the galaxy becomes a vinyl record.** 4200 particles in a three-arm
logarithmic spiral collapse into concentric grooves: the radius quantises onto 26 rings, the arm
angle slides to a uniform ring angle, differential rotation gives way to rigid spin, the disc tilts
up, and grains inside the label radius turn red. A record surface resolves underneath — body,
grooves, specular sweep, label, spindle hole, rim — then the whole thing blows past the frame.

**Phase B (p 0.30 → 0.965) — the section objects.** Four grain fields sampled from real photographs
of awards, travelling in depth. Windows overlap so a hand-off never shows empty black. Culture has no
trophy photograph, so its grain is sampled off a drawn television silhouette in the same way.

**Phase C — the closing sheet spiral.** Fires on click, not on scroll. Sixteen sheets travel one
shared spiral path out of a vanishing point, widening and curling as they near the lens, until the
last of them fills the frame and the issue opens. One shot, 1700ms, not a loop.

Every constant is ported from the handoff's motion specification and should be treated as fixed —
the damped scroll follow, the vinyl morph, the beat windows, the depth maths, the sampling
threshold, the gold ramp, the spiral path. Four things are worth knowing before editing it:

- Elements are looked up by attribute each frame, never held as long-lived refs.
- Exactly one animation loop runs per page; a new claim cancels the previous one, and the draw call
  sits inside a `try` so one bad frame cannot break the frame chain.
- `requestAnimationFrame` can be throttled to nothing in a backgrounded or offscreen frame, which
  would leave the intro stuck on one faint frame. A 200ms timer draws as well, and the damping
  integrates real elapsed time, so sparse frames catch up.
- Under `prefers-reduced-motion` it renders **one** static frame and redraws on scroll. No loop is
  ever started, the restart timer is disabled, and the button simply navigates rather than firing
  the flight — the prototype restarted the loop through its heartbeat.

Every word of the intro is real text in the DOM, so the page reads without canvas or JavaScript. The
"Read Issue 01" button is a real `<a href>`, so with JS off it navigates like any link.

The intro plays once per reader: it sets `dsir:seen-intro` in `localStorage` and returning readers
are redirected to the current issue. `?replay` forces it; `?skip` skips it and records the flag.
Skip goes straight to the issue; the button fires the sheet spiral first.

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
6. **Cover imagery for the closing spiral.** The sixteen flying sheets share eight typographic
   plates generated in code, because no cover photography exists. Real covers drop straight into the
   same flight in place of them; the plate specs live in `buildPlates()` in `src/scripts/intro.ts`.
7. **The editorial serif.** Newsreader stands in for a licensed transitional face. Swapping it is a
   one-line change in `src/styles/tokens/typography.css`.
8. **Sections vs. the footer.** The handoff's content model lists five sections (film, music,
   literature, culture, build-it) while the design system's footer listed "Sport" as a sixth. The five
   are canonical here and the footer renders from that data; the two "Sport" and "In Memory Of"
   pieces carry those labels as kickers. Worth a decision either way.
