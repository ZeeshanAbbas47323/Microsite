/**
 * Visual differences between layouts. All layouts share the same section structure (so content
 * and theme survive a layout switch, FR-3.4) but differ in rhythm, hero treatment and cards.
 */
export interface LayoutVariant {
  container: string;
  section: string;
  heading: string;
  /** Title of system pages (products, cart, checkout...). */
  pageTitle: string;
  eyebrow: string;
  /**
   * overlay: full-bleed colored/photo hero · split: text beside image · centered: big type, image
   * below · framed: image in a frame on a tinted band · compact: short colored band.
   */
  hero: 'overlay' | 'split' | 'centered' | 'framed' | 'compact';
  heroTitle: string;
  card: string;
  cardImage: string;
  button: string;
  buttonSecondary: string;
}

const button =
  'inline-flex items-center justify-center gap-2 rounded-[var(--ms-btn-radius)] px-6 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ms-primary)] disabled:opacity-50';
const primary = `${button} bg-[var(--ms-primary)] text-[var(--ms-on-primary)] hover:brightness-110`;
const outline = `${button} border border-[var(--ms-border)] bg-transparent text-[var(--ms-text)] hover:border-[var(--ms-primary)]`;

export const VARIANTS: Record<string, LayoutVariant> = {
  'bold-01': {
    container: 'mx-auto w-full max-w-6xl px-4 sm:px-6',
    section: 'py-14 sm:py-20',
    heading: 'text-3xl font-extrabold tracking-tight sm:text-4xl',
    pageTitle: 'text-3xl font-extrabold tracking-tight sm:text-4xl',
    eyebrow: 'text-xs font-bold uppercase tracking-[0.2em] text-[var(--ms-primary)]',
    hero: 'overlay',
    heroTitle: 'text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl',
    card: 'group flex flex-col overflow-hidden rounded-[var(--ms-radius)] bg-[var(--ms-surface)] shadow-sm ring-1 ring-[var(--ms-border)] transition hover:-translate-y-0.5 hover:shadow-lg',
    cardImage: 'aspect-square w-full object-cover',
    button: primary,
    buttonSecondary: `${button} bg-[var(--ms-secondary)] text-[var(--ms-on-secondary)] hover:brightness-105`,
  },
  'classic-01': {
    container: 'mx-auto w-full max-w-5xl px-4 sm:px-6',
    section: 'py-12 sm:py-16',
    heading: 'text-2xl font-semibold tracking-tight sm:text-3xl',
    pageTitle: 'text-3xl font-semibold tracking-tight',
    eyebrow: 'text-xs font-medium uppercase tracking-[0.15em] text-[var(--ms-muted)]',
    hero: 'split',
    heroTitle: 'text-4xl font-semibold leading-tight tracking-tight sm:text-5xl',
    card: 'group flex flex-col overflow-hidden rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-[var(--ms-bg)] transition hover:border-[var(--ms-primary)]',
    cardImage: 'aspect-[4/5] w-full object-cover',
    button: primary,
    buttonSecondary: outline,
  },
  'minimal-01': {
    container: 'mx-auto w-full max-w-5xl px-5 sm:px-8',
    section: 'py-16 sm:py-24',
    heading: 'text-2xl font-medium tracking-tight sm:text-3xl',
    pageTitle: 'text-3xl font-light tracking-tight sm:text-4xl',
    eyebrow: 'text-xs uppercase tracking-[0.3em] text-[var(--ms-muted)]',
    hero: 'centered',
    heroTitle: 'text-4xl font-light leading-tight tracking-tight sm:text-6xl',
    card: 'group flex flex-col overflow-hidden transition hover:opacity-90',
    cardImage: 'aspect-[3/4] w-full rounded-[var(--ms-radius)] object-cover',
    button: primary,
    buttonSecondary: `${button} border-b-2 border-[var(--ms-text)] !rounded-none !px-1 text-[var(--ms-text)] hover:border-[var(--ms-primary)]`,
  },
  'boutique-01': {
    container: 'mx-auto w-full max-w-6xl px-4 sm:px-6',
    section: 'py-14 sm:py-20',
    heading: 'text-3xl font-semibold italic tracking-tight sm:text-4xl',
    pageTitle: 'text-3xl font-semibold italic tracking-tight sm:text-4xl',
    eyebrow: 'text-xs uppercase tracking-[0.25em] text-[var(--ms-primary)]',
    hero: 'framed',
    heroTitle: 'text-4xl font-semibold leading-tight sm:text-6xl',
    card: 'group flex flex-col overflow-hidden rounded-[var(--ms-radius)] bg-[var(--ms-surface)] ring-1 ring-[var(--ms-border)] transition hover:ring-[var(--ms-primary)]',
    cardImage: 'aspect-[4/5] w-full object-cover',
    button: primary,
    buttonSecondary: outline,
  },
  'market-01': {
    container: 'mx-auto w-full max-w-7xl px-3 sm:px-6',
    section: 'py-8 sm:py-12',
    heading: 'text-xl font-extrabold uppercase tracking-wide sm:text-2xl',
    pageTitle: 'text-2xl font-extrabold uppercase tracking-wide sm:text-3xl',
    eyebrow: 'text-xs font-bold uppercase tracking-widest text-[var(--ms-primary)]',
    hero: 'compact',
    heroTitle: 'text-3xl font-extrabold uppercase leading-tight sm:text-5xl',
    card: 'group flex flex-col overflow-hidden rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-[var(--ms-bg)] transition hover:shadow-md',
    cardImage: 'aspect-square w-full object-cover',
    button: primary,
    buttonSecondary: `${button} bg-[var(--ms-secondary)] text-[var(--ms-on-secondary)] hover:brightness-105`,
  },
};

export function variantFor(layoutId: string): LayoutVariant {
  return VARIANTS[layoutId] ?? (VARIANTS['bold-01'] as LayoutVariant);
}
