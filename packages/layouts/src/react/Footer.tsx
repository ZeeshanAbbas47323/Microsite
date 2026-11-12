import { pagePath, whatsappHref } from './links';
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

export function Footer({ ctx }: { ctx: RenderContext }) {
  const { footer, business, pages } = ctx.config;
  const v = variantFor(ctx.config.layoutId);

  if (footer.style === 'minimal') {
    return (
      <footer className="border-t border-[var(--ms-border)] py-8 text-center text-sm text-[var(--ms-muted)]">
        <p>{footer.text}</p>
      </footer>
    );
  }

  if (footer.style === 'columns') {
    const { contact } = business;
    return (
      <footer className="mt-auto border-t border-[var(--ms-border)] bg-[var(--ms-surface)]">
        <div className={`${v.container} grid gap-8 py-12 sm:grid-cols-3`}>
          <div className="space-y-2">
            <p className="text-lg font-bold">{business.name}</p>
            {business.tagline ? (
              <p className="text-sm text-[var(--ms-muted)]">{business.tagline}</p>
            ) : null}
            <SocialLinks ctx={ctx} />
          </div>
          <nav aria-label="Footer">
            <p className="mb-3 text-sm font-semibold">Pages</p>
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
        <p className="border-t border-[var(--ms-border)] py-5 text-center text-xs text-[var(--ms-muted)]">
          {footer.text}
        </p>
      </footer>
    );
  }

  return (
    <footer className="mt-auto border-t border-[var(--ms-border)]">
      <div
        className={`${v.container} flex flex-col items-center justify-between gap-4 py-8 text-sm text-[var(--ms-muted)] sm:flex-row`}
      >
        <p>{footer.text}</p>
        <SocialLinks ctx={ctx} />
      </div>
    </footer>
  );
}
