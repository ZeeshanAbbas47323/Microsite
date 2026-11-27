import { TEXT_LIMITS as L } from '@microstore/site-schema';
import { editableAttrs, FOOTER_ID, pagePath, textAttrs, whatsappHref } from './links';
import type { RenderContext } from './types';
import { variantFor } from './variants';

function SocialLinks({ ctx }: { ctx: RenderContext }) {
  const { social } = ctx.config.business;
  const links = [
    ['Facebook', social.facebook],
    ['Instagram', social.instagram],
    ['TikTok', social.tiktok],
  ].filter(([, url]) => url);
  if (!links.length) return null;
  return (
    <ul className="flex flex-wrap gap-4 text-sm">
      {links.map(([label, url]) => (
        <li key={label}>
          <a
            href={url}
            rel="noopener noreferrer"
            target="_blank"
            className="underline-offset-4 hover:underline"
          >
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

const ALIGN_TEXT = { left: 'text-start', center: 'text-center', right: 'text-end' } as const;
const ALIGN_ROW = {
  left: 'sm:justify-start',
  center: 'sm:justify-center',
  right: 'sm:justify-end',
} as const;

export function Footer({ ctx }: { ctx: RenderContext }) {
  const { footer, business, pages } = ctx.config;
  const v = variantFor(ctx.config.layoutId);
  const about = footer.about || business.tagline;
  // Bottom line alignment (start/end so right-to-left stores mirror it).
  const align = footer.bottomAlign === 'auto' ? undefined : footer.bottomAlign;
  const textAlign = align ? ALIGN_TEXT[align] : null;
  // FR-5.10: every footer links to order tracking.
  const track = (
    <ctx.Link href={ctx.href('/track')} className="hover:underline">
      Track your order
    </ctx.Link>
  );

  if (footer.style === 'minimal') {
    return (
      <footer
        className="border-t border-[var(--ms-border)] py-8 text-center text-sm text-[var(--ms-muted)]"
        {...editableAttrs(ctx, FOOTER_ID, 'Footer')}
      >
        {footer.about ? (
          <p
            className="mx-auto mb-3 max-w-xl whitespace-pre-line"
            {...textAttrs(ctx, 'footer.about', L.footerAbout, { multiline: true })}
          >
            {footer.about}
          </p>
        ) : null}
        <div className={textAlign ? `${v.container} ${textAlign}` : ''}>
          <p {...textAttrs(ctx, 'footer.text', L.footerText)}>{footer.text}</p>
          <p className="mt-2">{track}</p>
        </div>
      </footer>
    );
  }

  if (footer.style === 'columns') {
    const { contact } = business;
    return (
      <footer
        className="mt-auto border-t border-[var(--ms-border)] bg-[var(--ms-surface)]"
        {...editableAttrs(ctx, FOOTER_ID, 'Footer')}
      >
        <div
          className={`${v.container} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.4fr]`}
        >
          <div className="space-y-3">
            <p className="text-lg font-bold">{business.name}</p>
            {about ? (
              <p
                className="max-w-xs whitespace-pre-line text-sm text-[var(--ms-muted)]"
                {...(footer.about
                  ? textAttrs(ctx, 'footer.about', L.footerAbout, { multiline: true })
                  : {})}
              >
                {about}
              </p>
            ) : null}
            <SocialLinks ctx={ctx} />
          </div>
          <nav aria-label="Shop">
            <p className="mb-3 text-sm font-semibold">Shop</p>
            <ul className="space-y-2 text-sm">
              {pages.map((p) => (
                <li key={p.slug}>
                  <ctx.Link href={ctx.href(pagePath(p.slug))} className="hover:underline">
                    {p.title}
                  </ctx.Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help">
            <p className="mb-3 text-sm font-semibold">Help</p>
            <ul className="space-y-2 text-sm">
              <li>{track}</li>
              <li>
                <ctx.Link href={ctx.href('/cart')} className="hover:underline">
                  Your cart
                </ctx.Link>
              </li>
              <li className="text-[var(--ms-muted)]">Cash on delivery</li>
            </ul>
          </nav>
          <address className="space-y-2 text-sm not-italic">
            <p className="mb-3 font-semibold">Contact</p>
            {contact.phone ? (
              <p>
                <a href={`tel:${contact.phone}`} className="hover:underline">
                  {contact.phone}
                </a>
              </p>
            ) : null}
            {contact.whatsapp ? (
              <p>
                <a
                  href={whatsappHref(contact.whatsapp)}
                  className="hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp
                </a>
              </p>
            ) : null}
            {contact.email ? (
              <p>
                <a href={`mailto:${contact.email}`} className="hover:underline">
                  {contact.email}
                </a>
              </p>
            ) : null}
            {contact.city ? (
              <p className="text-[var(--ms-muted)]">
                {[contact.address, contact.city].filter(Boolean).join(', ')}
              </p>
            ) : null}
          </address>
        </div>
        <div className="border-t border-[var(--ms-border)]">
          <p
            className={`${v.container} py-5 text-xs text-[var(--ms-muted)] ${textAlign ?? 'text-center sm:text-start'}`}
            {...textAttrs(ctx, 'footer.text', L.footerText)}
          >
            {footer.text}
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="mt-auto border-t border-[var(--ms-border)]"
      {...editableAttrs(ctx, FOOTER_ID, 'Footer')}
    >
      {footer.about ? (
        <div className={`${v.container} border-b border-[var(--ms-border)] py-8`}>
          <p className="font-semibold">{business.name}</p>
          <p
            className="mt-1 max-w-2xl whitespace-pre-line text-sm text-[var(--ms-muted)]"
            {...textAttrs(ctx, 'footer.about', L.footerAbout, { multiline: true })}
          >
            {footer.about}
          </p>
        </div>
      ) : null}
      <div
        className={`${v.container} flex flex-col items-center gap-4 py-8 text-sm text-[var(--ms-muted)] sm:flex-row ${align ? `sm:gap-8 ${ALIGN_ROW[align]}` : 'justify-between'}`}
      >
        <p {...textAttrs(ctx, 'footer.text', L.footerText)}>{footer.text}</p>
        {track}
        <SocialLinks ctx={ctx} />
      </div>
    </footer>
  );
}
