/* Standing site data. None of this belongs in markup — it changes each issue. */

export const SITE = {
  name: 'DSIR.',
  title: 'The Doon School Information Review',
  blurb:
    'The Doon School Information Review. Essays, reviews and cultural analysis, published from Dehradun.',
  place: 'The Doon School, Dehradun',
  copyright: '© 2026 DSIR',
  currentIssue: '01',
  currentIssueLabel: 'Digest Issue 01',
  currentIssueDate: 'September 2026',
} as const;

export type SectionSlug = 'film' | 'music' | 'literature' | 'culture' | 'build-it';

export interface Section {
  slug: SectionSlug;
  label: string;
  /* The caps descriptor the intro sets under each section beat. */
  descriptor: string;
  standfirst: string;
  editor?: string;
}

export const SECTIONS: Section[] = [
  {
    slug: 'film',
    label: 'Film',
    descriptor: 'Reviews, retrospectives, arguments',
    standfirst:
      'Reviews, retrospectives and the occasional argument about what cinema owes its audience.',
    editor: 'Rehaan Chadha · Senior Editor',
  },
  {
    slug: 'music',
    label: 'Music',
    descriptor: 'Rollouts, records, the streaming economy',
    standfirst: 'Rollouts, records, and the streaming economy that decides which of them counts.',
    editor: 'Rehaan Chadha · Senior Editor',
  },
  {
    slug: 'literature',
    label: 'Literature',
    descriptor: 'The canon nobody assigned',
    standfirst: 'The canon nobody assigned, and the books that got read anyway.',
    editor: 'Rehaan Chadha · Senior Editor',
  },
  {
    slug: 'culture',
    label: 'Culture',
    descriptor: 'Celebrity, television, the internet',
    standfirst: 'Celebrity, television and the internet, taken at least as seriously as they take themselves.',
    editor: 'Rehaan Chadha · Senior Editor',
  },
  {
    slug: 'build-it',
    label: 'Build It',
    descriptor: 'A fantasy-budget draft',
    standfirst: 'A fantasy-budget draft. Three tiers, five picks a row, and a fixed sum to spend.',
    editor: 'Hridansh Nagpal',
  },
];

export const sectionBySlug = (slug: string): Section | undefined =>
  SECTIONS.find((s) => s.slug === slug);

export const sectionLabel = (slug: string): string => sectionBySlug(slug)?.label ?? slug;

/* Masthead, Digest Issue 01. Keep it here, not in markup — it changes each issue. */
export const BOARD: Array<[name: string, role: string]> = [
  ['Aadidev Basu', 'Editor-in-Chief'],
  ['Tanay Chowdhary', 'Chief-of-Production'],
  ['Rehaan Chadha', 'Senior Editor'],
  ['Nanda Karumudi', 'Chief-of-Design'],
];

export const ASSOCIATE_EDITORS = [
  'Nanda Karumudi',
  'Ritvik Agrawal',
  'Anuraag Basu',
  'Virren Jindal',
];

export const SENIOR_CORRESPONDENTS = [
  'Abhir Kohli',
  'Krishnav Sarawgi',
  'Anvit Agrawal',
  'Hridansh Nagpal',
];

export const MASTER_IN_CHARGE: [name: string, role: string] = [
  'Mr Harshal Gunwant',
  'Master-in-Charge',
];

/* Back issues. Only Issue 01 has pieces in the collection so far; the rest are
   the archive's standing record. */
export interface Issue {
  n: string;
  season: string;
  date: string;
  live?: boolean;
}

export const ISSUES: Issue[] = [
  { n: '01', season: 'Digest', date: 'Sep 2026', live: true },
  { n: '12', season: 'Summer', date: 'Jul 2026' },
  { n: '11', season: 'Spring', date: 'Apr 2026' },
  { n: '10', season: 'Winter', date: 'Jan 2026' },
  { n: '09', season: 'Autumn', date: 'Oct 2025' },
  { n: '08', season: 'Summer', date: 'Jul 2025' },
  { n: '07', season: 'Spring', date: 'Apr 2025' },
  { n: '06', season: 'Winter', date: 'Jan 2025' },
];

export const GENRES = [
  'Essay',
  'Review',
  'Interview',
  'Column',
  'Culture',
  'Film',
  'Music',
  'Build It',
] as const;
