import type { ReactNode } from 'react';
import type { RenderContext } from './types';

/** Internal links go through the app's Link (and keep preview mode); external ones open safely. */
export function SmartLink({
  ctx,
  href,
  className,
  children,
}: {
  ctx: RenderContext;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (href.startsWith('/')) {
    return (
      <ctx.Link href={ctx.href(href)} className={className}>
        {children}
      </ctx.Link>
    );
  }
  return (
    <a href={href} className={className} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export function pagePath(slug: string): string {
  return slug === 'home' ? '/' : `/${slug}`;
}

/** wa.me link for a +92 number. */
export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

/** Ids the theme editor uses for the header and footer (they are not page sections). */
export const HEADER_ID = '__header';
export const FOOTER_ID = '__footer';

/** Marks a block as selectable in the theme editor preview (`ctx.editable`). */
export function editableAttrs(ctx: RenderContext, id: string, label: string) {
  return ctx.editable ? { 'data-ms-section': id, 'data-ms-label': label } : {};
}
