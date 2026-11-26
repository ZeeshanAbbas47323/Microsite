import type { SectionType } from '@microstore/site-schema';

/** Line icons for the theme editor (24px grid, drawn with the current text colour). */
export function Icon({ d, className = 'h-[18px] w-[18px]' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const PATHS = {
  exit: 'M10 17l-5-5 5-5M5 12h11a4 4 0 0 0 4-4V5',
  sections: 'M4 4h16v5H4zM4 13h16v7H4z',
  theme:
    'M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3-3.5 3H16a2 2 0 0 0-1.4 3.4A1.5 1.5 0 0 1 12 21zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  page: 'M6 3h9l4 4v14H6zM14 3v5h5',
  desktop: 'M3 4h18v12H3zM8 20h8M12 16v4',
  tablet: 'M6 3h12v18H6zM11 18h2',
  mobile: 'M8 3h8v18H8zM11 18h2',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 3v4M17 5h4',
  assistant: 'M4 5h16v11H9l-5 4zM9 10h.01M12 10h.01M15 10h.01',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  plusCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v8M8 12h8',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  chevron: 'M9 6l6 6-6 6',
  header: 'M4 4h16v6H4zM4 14h16M4 18h10',
  footer: 'M4 14h16v6H4zM4 6h16M4 10h10',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  alert: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  megaphone: 'M3 10v4h4l6 4V6l-6 4zM17 9a4 4 0 0 1 0 6',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M10 20h.01M17 20h.01',
  check: 'M5 12l5 5 9-10',
  truck:
    'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  design: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  products: 'M20 13l-7 7-9-9V4h7zM8 8h.01',
  orders: 'M4 4h16v16H4zM4 9h16M9 13h6',
  customers:
    'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  discounts:
    'M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01M4 12l1.5-1.5V7.5h3L10 6l2-2 2 2 1.5 1.5h3v3L20 12l-1.5 1.5v3h-3L14 18l-2 2-2-2-1.5-1.5h-3v-3z',
  domains:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  language: 'M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c-.5 4-3 7-6 8M13 21l4-9 4 9M14.5 18h5',
} as const;

export const SECTION_PATHS: Record<SectionType, string> = {
  hero: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  features: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  categoryGrid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  productGrid: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0',
  imageText: 'M3 5h8v14H3zM14 8h7M14 12h7M14 16h5',
  richText: 'M4 6h16M4 10h16M4 14h10M4 18h12',
  banner: 'M3 10v4h4l6 4V6l-6 4zM17 9a4 4 0 0 1 0 6',
  testimonials: 'M4 5h16v11H8l-4 4z',
  faq: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
  contactInfo:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
};
