import { SmartLink, whatsappHref } from '../links';
import { ProductList } from '../ProductCard';
import type { RenderContext, Section } from '../types';
import { variantFor } from '../variants';

type Of<T extends Section['type']> = Extract<Section, { type: T }>;
interface Props<T extends Section['type']> {
  ctx: RenderContext;
  section: Of<T>;
  /** First section on the page: its image is the LCP candidate. */
  first: boolean;
}

function Hero({ ctx, section, first }: Props<'hero'>) {
  const v = variantFor(ctx.config.layoutId);
  const { title, subtitle, imageUrl, ctaLabel, ctaLink } = section.props;
  // On the colored overlay hero the button is inverted so it never blends into the background.
  const ctaClass =
    v.hero === 'overlay'
      ? v.button.replace(
          'bg-[var(--ms-primary)] text-[var(--ms-on-primary)]',
          'bg-[var(--ms-on-primary)] text-[var(--ms-primary)]',
        )
      : v.button;
  const cta =
    ctaLabel && ctaLink ? (
      <SmartLink ctx={ctx} href={ctaLink} className={ctaClass}>
        {ctaLabel}
      </SmartLink>
    ) : null;

  if (v.hero === 'overlay') {
    return (
      <section className="relative isolate overflow-hidden bg-[var(--ms-primary)] text-[var(--ms-on-primary)]">
        {imageUrl ? (
          <>
            <ctx.Image
              src={imageUrl}
              alt=""
              width={1600}
              height={900}
              sizes="100vw"
              priority={first}
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-black/55" aria-hidden="true" />
          </>
        ) : (
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,var(--ms-secondary),transparent_55%)] opacity-40"
            aria-hidden="true"
          />
        )}
        <div
          className={`${v.container} flex min-h-[60vh] flex-col justify-center gap-6 py-20 ${imageUrl ? 'text-white' : ''}`}
        >
          <h1 className={`${v.heroTitle} max-w-3xl`}>{title}</h1>
          {subtitle ? <p className="max-w-xl text-lg opacity-90">{subtitle}</p> : null}
          {cta ? <div>{cta}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={v.section}>
      <div
        className={`${v.container} grid items-center gap-10 ${imageUrl ? 'md:grid-cols-2' : 'text-center'}`}
      >
        <div className={`flex flex-col gap-5 ${imageUrl ? '' : 'items-center'}`}>
          <h1 className={v.heroTitle}>{title}</h1>
          {subtitle ? <p className="max-w-xl text-lg text-[var(--ms-muted)]">{subtitle}</p> : null}
          {cta ? <div>{cta}</div> : null}
        </div>
        {imageUrl ? (
          <ctx.Image
            src={imageUrl}
            alt=""
            width={900}
            height={700}
            sizes="(min-width: 768px) 50vw, 100vw"
            priority={first}
            className="aspect-[9/7] w-full rounded-[var(--ms-radius)] object-cover"
          />
        ) : null}
      </div>
    </section>
  );
}

function ProductGrid({ ctx, section, first }: Props<'productGrid'>) {
  const v = variantFor(ctx.config.layoutId);
  const products = ctx.sectionProducts[section.id] ?? [];
  const { title, source } = section.props;
  return (
    <section className={v.section}>
      <div className={`${v.container} flex flex-col gap-8`}>
        {title || source !== 'all' ? (
          <div className="flex items-end justify-between gap-4">
            {title ? <h2 className={v.heading}>{title}</h2> : <span />}
            {source !== 'all' ? (
              <ctx.Link
                href={ctx.href('/products')}
                className="shrink-0 text-sm font-semibold text-[var(--ms-primary)] underline-offset-4 hover:underline"
              >
                View all
              </ctx.Link>
            ) : null}
          </div>
        ) : null}
        {products.length ? (
          <ProductList ctx={ctx} products={products} priorityCount={first ? 4 : 0} />
        ) : (
          <p className="rounded-[var(--ms-radius)] border border-dashed border-[var(--ms-border)] p-8 text-center text-[var(--ms-muted)]">
            New products are coming soon.
          </p>
        )}
      </div>
    </section>
  );
}

function RichText({ ctx, section }: Props<'richText'>) {
  const v = variantFor(ctx.config.layoutId);
  return (
    <section className={v.section}>
      <div className={`${v.container} max-w-3xl space-y-5`}>
        {section.props.title ? <h2 className={v.heading}>{section.props.title}</h2> : null}
        {section.props.paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line text-lg leading-relaxed text-[var(--ms-muted)]">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

function ImageText({ ctx, section }: Props<'imageText'>) {
  const v = variantFor(ctx.config.layoutId);
  const { title, body, imageUrl, imagePosition, ctaLabel, ctaLink } = section.props;
  return (
    <section className={v.section}>
      <div className={`${v.container} grid items-center gap-10 md:grid-cols-2`}>
        <div className={imagePosition === 'left' ? 'md:order-2' : ''}>
          {title ? <h2 className={`${v.heading} mb-4`}>{title}</h2> : null}
          <p className="whitespace-pre-line text-lg leading-relaxed text-[var(--ms-muted)]">
            {body}
          </p>
          {ctaLabel && ctaLink ? (
            <SmartLink ctx={ctx} href={ctaLink} className={`${v.buttonSecondary} mt-6`}>
              {ctaLabel}
            </SmartLink>
          ) : null}
        </div>
        {imageUrl ? (
          <ctx.Image
            src={imageUrl}
            alt=""
            width={800}
            height={600}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="aspect-[4/3] w-full rounded-[var(--ms-radius)] object-cover"
          />
        ) : (
          <div
            className="aspect-[4/3] w-full rounded-[var(--ms-radius)] bg-[linear-gradient(135deg,var(--ms-primary),var(--ms-secondary))] opacity-80"
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}

function ContactInfo({ ctx, section }: Props<'contactInfo'>) {
  const v = variantFor(ctx.config.layoutId);
  const { contact, social } = ctx.config.business;
  const items: { label: string; value: string; href?: string; external?: boolean }[] = [];
  if (contact.phone)
    items.push({ label: 'Phone', value: contact.phone, href: `tel:${contact.phone}` });
  if (section.props.showWhatsapp && contact.whatsapp) {
    items.push({
      label: 'WhatsApp',
      value: contact.whatsapp,
      href: whatsappHref(contact.whatsapp),
      external: true,
    });
  }
  if (contact.email)
    items.push({ label: 'Email', value: contact.email, href: `mailto:${contact.email}` });
  const location = [contact.address, contact.city].filter(Boolean).join(', ');
  if (location) items.push({ label: 'Address', value: location });
  const socials = section.props.showSocial
    ? (
        [
          ['Facebook', social.facebook],
          ['Instagram', social.instagram],
          ['TikTok', social.tiktok],
        ] as const
      ).filter(([, u]) => u)
    : [];

  return (
    <section className={v.section}>
      <div className={`${v.container} space-y-8`}>
        <div className="space-y-2">
          {section.props.title ? <h2 className={v.heading}>{section.props.title}</h2> : null}
          {section.props.subtitle ? (
            <p className="text-[var(--ms-muted)]">{section.props.subtitle}</p>
          ) : null}
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5"
            >
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--ms-muted)]">
                {item.label}
              </dt>
              <dd className="mt-1 text-lg font-medium break-words">
                {item.href ? (
                  <a
                    href={item.href}
                    className="hover:underline"
                    {...(item.external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}
                  >
                    {item.value}
                  </a>
                ) : (
                  item.value
                )}
              </dd>
            </div>
          ))}
        </dl>
        {socials.length ? (
          <ul className="flex flex-wrap gap-3">
            {socials.map(([label, url]) => (
              <li key={label}>
                <a
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className={v.buttonSecondary}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Faq({ ctx, section }: Props<'faq'>) {
  const v = variantFor(ctx.config.layoutId);
  if (!section.props.items.length) return null;
  return (
    <section className={v.section}>
      <div className={`${v.container} max-w-3xl space-y-6`}>
        {section.props.title ? <h2 className={v.heading}>{section.props.title}</h2> : null}
        <div className="divide-y divide-[var(--ms-border)] rounded-[var(--ms-radius)] border border-[var(--ms-border)]">
          {section.props.items.map((item, i) => (
            <details key={i} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  className="text-xl leading-none transition group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-line text-[var(--ms-muted)]">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials({ ctx, section }: Props<'testimonials'>) {
  const v = variantFor(ctx.config.layoutId);
  if (!section.props.items.length) return null;
  return (
    <section className={`${v.section} bg-[var(--ms-surface)]`}>
      <div className={`${v.container} space-y-8`}>
        {section.props.title ? <h2 className={v.heading}>{section.props.title}</h2> : null}
        <ul className="grid gap-5 md:grid-cols-3">
          {section.props.items.map((t, i) => (
            <li key={i}>
              <figure className="h-full rounded-[var(--ms-radius)] bg-[var(--ms-bg)] p-6 ring-1 ring-[var(--ms-border)]">
                <blockquote className="text-lg leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold">{t.author}</span>
                  {t.role ? <span className="text-[var(--ms-muted)]">, {t.role}</span> : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Banner({ ctx, section }: Props<'banner'>) {
  const v = variantFor(ctx.config.layoutId);
  const { title, ctaLabel, ctaLink, tone } = section.props;
  const toneClass =
    tone === 'primary'
      ? 'bg-[var(--ms-primary)] text-[var(--ms-on-primary)]'
      : tone === 'secondary'
        ? 'bg-[var(--ms-secondary)] text-[var(--ms-on-secondary)]'
        : 'bg-[var(--ms-surface)]';
  return (
    <section className={toneClass}>
      <div
        className={`${v.container} flex flex-col items-center justify-between gap-4 py-8 text-center sm:flex-row sm:text-start`}
      >
        <p className="text-lg font-semibold">{title}</p>
        {ctaLabel && ctaLink ? (
          <SmartLink
            ctx={ctx}
            href={ctaLink}
            className="inline-flex items-center rounded-[var(--ms-btn-radius)] border-2 border-current px-5 py-2.5 text-sm font-semibold transition hover:bg-black/10"
          >
            {ctaLabel}
          </SmartLink>
        ) : null}
      </div>
    </section>
  );
}

/** Renders every visible section of a page in order. Unknown types render nothing. */
export function Sections({ ctx, sections }: { ctx: RenderContext; sections: Section[] }) {
  const visible = sections.filter((s) => s.visible);
  return (
    <>
      {visible.map((section, i) => {
        const first = i === 0;
        switch (section.type) {
          case 'hero':
            return <Hero key={section.id} ctx={ctx} section={section} first={first} />;
          case 'productGrid':
            return <ProductGrid key={section.id} ctx={ctx} section={section} first={first} />;
          case 'richText':
            return <RichText key={section.id} ctx={ctx} section={section} first={first} />;
          case 'imageText':
            return <ImageText key={section.id} ctx={ctx} section={section} first={first} />;
          case 'contactInfo':
            return <ContactInfo key={section.id} ctx={ctx} section={section} first={first} />;
          case 'faq':
            return <Faq key={section.id} ctx={ctx} section={section} first={first} />;
          case 'testimonials':
            return <Testimonials key={section.id} ctx={ctx} section={section} first={first} />;
          case 'banner':
            return <Banner key={section.id} ctx={ctx} section={section} first={first} />;
          default:
            return null;
        }
      })}
    </>
  );
}
