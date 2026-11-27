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
export const ANNOUNCEMENT_ID = '__announcement';

/** Marks a block as selectable in the theme editor preview (`ctx.editable`). */
export function editableAttrs(ctx: RenderContext, id: string, label: string) {
  return ctx.editable ? { 'data-ms-section': id, 'data-ms-label': label } : {};
}

/**
 * Marks a piece of text as editable in place (double-click in the theme editor preview).
 * `path` is a dot path into the enclosing section's props (e.g. `items.2.question`), or into the
 * site config for the header, footer and announcement bar (e.g. `footer.text`).
 */
export function textAttrs(
  ctx: RenderContext,
  path: string,
  max: number,
  opts: { multiline?: boolean; required?: boolean } = {},
) {
  if (!ctx.editable) return {};
  return {
    'data-ms-text': path,
    'data-ms-max': String(max),
    ...(opts.multiline ? { 'data-ms-multiline': '' } : {}),
    ...(opts.required ? { 'data-ms-required': '' } : {}),
  };
}

/**
 * Marks an image as replaceable by double-clicking it in the theme editor preview. `path` works
 * like {@link textAttrs}; `purpose` picks the upload rules (logos also accept SVG).
 */
export function imageAttrs(ctx: RenderContext, path: string, purpose: 'image' | 'logo' = 'image') {
  if (!ctx.editable) return {};
  return { 'data-ms-image': path, 'data-ms-image-purpose': purpose };
}
