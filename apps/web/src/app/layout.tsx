import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// App typeface, self-hosted by next/font. globals.css makes it Tailwind's default sans font, which
// preflight applies to <html>. Storefronts set their own font from the store theme, so it is not
// preloaded (shop pages would download a font they never use).
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: 'Microstore',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
