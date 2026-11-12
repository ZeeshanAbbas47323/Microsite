import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { whatsappHref } from './links';
import { Navbar } from './Navbar';
import { themeStyle } from './theme';
import type { RenderContext } from './types';

/** The page frame every layout shares: theme variables, navbar, footer, WhatsApp button. */
export function SiteShell({
  ctx,
  fontFamily,
  banner,
  children,
}: {
  ctx: RenderContext;
  fontFamily?: string;
  /** Shown above the navbar (e.g. "Preview" notice). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const whatsapp = ctx.store.settings.whatsappButton ? ctx.config.business.contact.whatsapp : '';
  return (
    <div
      className="flex min-h-dvh flex-col antialiased"
      style={themeStyle(ctx.config, fontFamily)}
      dir={ctx.store.settings.rtl ? 'rtl' : 'ltr'}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      {banner}
      <Navbar ctx={ctx} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer ctx={ctx} />
      {whatsapp ? (
        <a
          href={whatsappHref(whatsapp)}
          rel="noopener noreferrer"
          target="_blank"
          aria-label="Chat on WhatsApp"
          className="fixed bottom-5 end-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}

/** Heading block for system pages (products, cart, checkout...). */
export function PageHeader({
  ctx,
  title,
  children,
}: {
  ctx: RenderContext;
  title: string;
  children?: ReactNode;
}) {
  const v =
    ctx.config.layoutId === 'classic-01'
      ? 'text-3xl font-semibold'
      : 'text-3xl font-extrabold sm:text-4xl';
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className={`${v} tracking-tight`}>{title}</h1>
      {children}
    </div>
  );
}
