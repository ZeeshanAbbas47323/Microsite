import { SECTION_INFO, TEXT_LIMITS as L } from '@microstore/site-schema';
import { Icon } from '../icons';
import { imageAttrs, SmartLink, textAttrs, whatsappHref } from '../links';
import { ProductList } from '../ProductCard';
import type { RenderContext, Section } from '../types';
import { variantFor } from '../variants';
import { Slideshow } from './Slideshow';

type Of<T extends Section['type']> = Extract<Section, { type: T }>;
interface Props<T extends Section['type']> {
  ctx: RenderContext;
  section: Of<T>;
  /** First section on the page: its image is the LCP candidate. */
  first: boolean;
}

function Hero({ ctx, section, first }: Props<'hero'>) {
  const v = variantFor(ctx.config.layoutId);
  const { title, subtitle, imageUrl, ctaLabel, ctaLink, eyebrow } = section.props;
  const colored = v.hero === 'overlay' || v.hero === 'compact';
  const heroTitle = textAttrs(ctx, 'title', L.sectionTitle, { required: true });
  const heroSub = textAttrs(ctx, 'subtitle', L.sectionSubtitle);
  // On colored heroes the button is inverted so it never blends into the background.
  const ctaClass = colored
    ? v.button.replace(
        'bg-[var(--ms-primary)] text-[var(--ms-on-primary)]',
        'bg-[var(--ms-on-primary)] text-[var(--ms-primary)]',
      )
    : v.button;
  const secondaryClass = colored
    ? `${v.button.replace('bg-[var(--ms-primary)] text-[var(--ms-on-primary)] hover:brightness-110', '')} border-2 border-current hover:bg-white/10`
    : v.buttonSecondary;
  const secondaryLabel = section.props.secondaryCtaLabel ?? '';
  const secondaryLink = section.props.secondaryCtaLink ?? '';
  const ctas =
    (ctaLabel && ctaLink) || (secondaryLabel && secondaryLink) ? (
      <div className="flex flex-wrap gap-3">
        {ctaLabel && ctaLink ? (
          <SmartLink ctx={ctx} href={ctaLink} className={ctaClass}>
            <span {...textAttrs(ctx, 'ctaLabel', L.ctaLabel)}>{ctaLabel}</span>
          </SmartLink>
        ) : null}
        {secondaryLabel && secondaryLink ? (
          <SmartLink ctx={ctx} href={secondaryLink} className={secondaryClass}>
            <span {...textAttrs(ctx, 'secondaryCtaLabel', L.ctaLabel)}>{secondaryLabel}</span>
          </SmartLink>
        ) : null}
      </div>
    ) : null;
  const eyebrowEl = eyebrow ? (
    <p
      className={colored ? 'text-xs font-bold uppercase tracking-[0.2em]' : v.eyebrow}
      {...textAttrs(ctx, 'eyebrow', L.ctaLabel)}
    >
      {eyebrow}
    </p>
  ) : null;

  if (v.hero === 'overlay') {
    return (
      <section className="relative isolate overflow-hidden bg-[var(--ms-primary)] text-[var(--ms-on-primary)]">
        {imageUrl ? (
          <>
            <ctx.Image
              src={imageUrl}
              {...imageAttrs(ctx, 'imageUrl')}
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
          {eyebrowEl}
          <h1 className={`${v.heroTitle} max-w-3xl`} {...heroTitle}>
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-xl text-lg opacity-90" {...heroSub}>
              {subtitle}
            </p>
          ) : null}
          {ctas}
        </div>
      </section>
    );
  }

  if (v.hero === 'centered') {
    return (
      <section className={v.section}>
        <div className={`${v.container} flex flex-col items-center gap-6 text-center`}>
          {eyebrowEl}
          <h1 className={`${v.heroTitle} max-w-4xl`} {...heroTitle}>
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-2xl text-lg text-[var(--ms-muted)]" {...heroSub}>
              {subtitle}
            </p>
          ) : null}
          {ctas}
        </div>
        {imageUrl ? (
          <div className={`${v.container} mt-12`}>
            <ctx.Image
              src={imageUrl}
              {...imageAttrs(ctx, 'imageUrl')}
              alt=""
              width={1600}
              height={686}
              sizes="(min-width: 1024px) 1024px, 100vw"
              priority={first}
              className="aspect-[21/9] w-full rounded-[var(--ms-radius)] object-cover"
            />
          </div>
        ) : null}
      </section>
    );
  }

  if (v.hero === 'framed') {
    return (
      <section
        className={`${v.section} bg-[color-mix(in_srgb,var(--ms-secondary)_18%,var(--ms-bg))]`}
      >
        <div
          className={`${v.container} grid items-center gap-10 ${imageUrl ? 'md:grid-cols-[5fr_6fr]' : 'text-center'}`}
        >
          {imageUrl ? (
            <div className="rounded-[var(--ms-radius)] bg-[var(--ms-bg)] p-3 shadow-sm ring-1 ring-[var(--ms-border)]">
              <ctx.Image
                src={imageUrl}
                {...imageAttrs(ctx, 'imageUrl')}
                alt=""
                width={800}
                height={1000}
                sizes="(min-width: 768px) 45vw, 100vw"
                priority={first}
                className="aspect-[4/5] w-full rounded-[calc(var(--ms-radius)*0.75)] object-cover"
              />
            </div>
          ) : null}
          <div className={`flex flex-col gap-5 ${imageUrl ? '' : 'items-center'}`}>
            <span className="h-px w-16 bg-[var(--ms-primary)]" aria-hidden="true" />
            {eyebrowEl}
            <h1 className={v.heroTitle} {...heroTitle}>
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-xl text-lg italic text-[var(--ms-muted)]" {...heroSub}>
                {subtitle}
              </p>
            ) : null}
            {ctas}
          </div>
        </div>
      </section>
    );
  }

  if (v.hero === 'compact') {
    return (
      <section className="bg-[var(--ms-primary)] text-[var(--ms-on-primary)]">
        <div
          className={`${v.container} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12`}
        >
          <div className="flex flex-col gap-3">
            {eyebrowEl}
            <h1 className={v.heroTitle} {...heroTitle}>
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-xl text-base sm:text-lg" {...heroSub}>
                {subtitle}
              </p>
            ) : null}
            {ctas ? <div className="pt-1">{ctas}</div> : null}
          </div>
          {imageUrl ? (
            <ctx.Image
              src={imageUrl}
              {...imageAttrs(ctx, 'imageUrl')}
              alt=""
              width={480}
              height={480}
              sizes="(min-width: 640px) 240px, 100vw"
              priority={first}
              className="aspect-square w-full rounded-[var(--ms-radius)] object-cover sm:w-60"
            />
          ) : null}
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
          {eyebrowEl}
          <h1 className={v.heroTitle} {...heroTitle}>
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-xl text-lg text-[var(--ms-muted)]" {...heroSub}>
              {subtitle}
            </p>
          ) : null}
          {ctas}
        </div>
        {imageUrl ? (
          <ctx.Image
            src={imageUrl}
            {...imageAttrs(ctx, 'imageUrl')}
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
            {title ? (
              <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
                {title}
              </h2>
            ) : (
              <span />
            )}
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
        {section.props.title ? (
          <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
            {section.props.title}
          </h2>
        ) : null}
        {section.props.paragraphs.map((p, i) => (
          <p
            key={i}
            className="whitespace-pre-line text-lg leading-relaxed text-[var(--ms-muted)]"
            {...textAttrs(ctx, `paragraphs.${i}`, L.body, { multiline: true })}
          >
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
          {title ? (
            <h2 className={`${v.heading} mb-4`} {...textAttrs(ctx, 'title', L.sectionTitle)}>
              {title}
            </h2>
          ) : null}
          <p
            className="whitespace-pre-line text-lg leading-relaxed text-[var(--ms-muted)]"
            {...textAttrs(ctx, 'body', L.body, { multiline: true })}
          >
            {body}
          </p>
          {ctaLabel && ctaLink ? (
            <SmartLink ctx={ctx} href={ctaLink} className={`${v.buttonSecondary} mt-6`}>
              <span {...textAttrs(ctx, 'ctaLabel', L.ctaLabel)}>{ctaLabel}</span>
            </SmartLink>
          ) : null}
        </div>
        {imageUrl ? (
          <ctx.Image
            src={imageUrl}
            {...imageAttrs(ctx, 'imageUrl')}
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
            {...imageAttrs(ctx, 'imageUrl')}
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
          {section.props.title ? (
            <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
              {section.props.title}
            </h2>
          ) : null}
          {section.props.subtitle ? (
            <p
              className="text-[var(--ms-muted)]"
              {...textAttrs(ctx, 'subtitle', L.sectionSubtitle)}
            >
              {section.props.subtitle}
            </p>
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
        {section.props.title ? (
          <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
            {section.props.title}
          </h2>
        ) : null}
        <div className="divide-y divide-[var(--ms-border)] rounded-[var(--ms-radius)] border border-[var(--ms-border)]">
          {section.props.items.map((item, i) => (
            <details key={i} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                <span
                  {...textAttrs(ctx, `items.${i}.question`, L.sectionSubtitle, { required: true })}
                >
                  {item.question}
                </span>
                <span
                  className="text-xl leading-none transition group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p
                className="mt-3 whitespace-pre-line text-[var(--ms-muted)]"
                {...textAttrs(ctx, `items.${i}.answer`, L.shortBody, {
                  multiline: true,
                  required: true,
                })}
              >
                {item.answer}
              </p>
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
        {section.props.title ? (
          <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
            {section.props.title}
          </h2>
        ) : null}
        <ul className="grid gap-5 md:grid-cols-3">
          {section.props.items.map((t, i) => (
            <li key={i}>
              <figure className="h-full rounded-[var(--ms-radius)] bg-[var(--ms-bg)] p-6 ring-1 ring-[var(--ms-border)]">
                <blockquote className="text-lg leading-relaxed">
                  “
                  <span {...textAttrs(ctx, `items.${i}.quote`, L.shortBody, { required: true })}>
                    {t.quote}
                  </span>
                  ”
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <span
                    className="font-semibold"
                    {...textAttrs(ctx, `items.${i}.author`, L.author, { required: true })}
                  >
                    {t.author}
                  </span>
                  {t.role ? (
                    <span className="text-[var(--ms-muted)]">
                      , <span {...textAttrs(ctx, `items.${i}.role`, L.author)}>{t.role}</span>
                    </span>
                  ) : null}
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
        <p
          className="text-lg font-semibold"
          {...textAttrs(ctx, 'title', L.sectionTitle, { required: true })}
        >
          {title}
        </p>
        {ctaLabel && ctaLink ? (
          <SmartLink
            ctx={ctx}
            href={ctaLink}
            className="inline-flex items-center rounded-[var(--ms-btn-radius)] border-2 border-current px-5 py-2.5 text-sm font-semibold transition hover:bg-black/10"
          >
            <span {...textAttrs(ctx, 'ctaLabel', L.ctaLabel)}>{ctaLabel}</span>
          </SmartLink>
        ) : null}
      </div>
    </section>
  );
}

function Features({ ctx, section }: Props<'features'>) {
  const v = variantFor(ctx.config.layoutId);
  const { title, items } = section.props;
  if (!items.length) return null;
  const cols =
    items.length >= 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'md:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <section
      className={
        title ? v.section : 'border-y border-[var(--ms-border)] bg-[var(--ms-surface)] py-8'
      }
    >
      <div className={`${v.container} space-y-8`}>
        {title ? (
          <h2 className={`${v.heading} text-center`} {...textAttrs(ctx, 'title', L.sectionTitle)}>
            {title}
          </h2>
        ) : null}
        <ul className={`grid gap-6 sm:grid-cols-2 ${cols}`}>
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ms-primary)_12%,var(--ms-bg))] text-[var(--ms-primary)]">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <div>
                <h3
                  className="font-semibold"
                  {...textAttrs(ctx, `items.${i}.title`, L.ctaLabel, { required: true })}
                >
                  {item.title}
                </h3>
                {item.text ? (
                  <p
                    className="text-sm text-[var(--ms-muted)]"
                    {...textAttrs(ctx, `items.${i}.text`, L.sectionSubtitle)}
                  >
                    {item.text}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CategoryGrid({ ctx, section }: Props<'categoryGrid'>) {
  const v = variantFor(ctx.config.layoutId);
  const tiles = (ctx.sectionCategories?.[section.id] ?? []).slice(0, section.props.limit);
  // One category is not worth a "shop by category" row.
  if (tiles.length < 2) return null;
  const { title, subtitle } = section.props;
  return (
    <section className={v.section}>
      <div className={`${v.container} space-y-8`}>
        {title || subtitle ? (
          <div className="space-y-2">
            {title ? (
              <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p
                className="text-[var(--ms-muted)]"
                {...textAttrs(ctx, 'subtitle', L.sectionSubtitle)}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
          {tiles.map((c) => (
            <li key={c.id}>
              <ctx.Link
                href={ctx.href(`/products?category=${encodeURIComponent(c.id)}`)}
                className="group relative block overflow-hidden rounded-[var(--ms-radius)] bg-[var(--ms-surface)] ring-1 ring-[var(--ms-border)]"
              >
                {c.imageUrl ? (
                  <ctx.Image
                    src={c.imageUrl}
                    alt=""
                    width={500}
                    height={600}
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="aspect-[5/6] w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="aspect-[5/6] w-full bg-[linear-gradient(135deg,var(--ms-primary),var(--ms-secondary))]"
                    aria-hidden="true"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-10 text-white">
                  <span className="text-base font-semibold sm:text-lg">{c.name}</span>
                  <span aria-hidden="true" className="transition group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </ctx.Link>
            </li>
          ))}
        </ul>
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
        const rendered = renderSection(ctx, section, i === 0);
        if (!ctx.editable || !rendered) return rendered;
        return (
          <div
            key={section.id}
            data-ms-section={section.id}
            data-ms-label={SECTION_INFO[section.type].label}
          >
            {rendered}
          </div>
        );
      })}
    </>
  );
}

function renderSection(ctx: RenderContext, section: Section, first: boolean) {
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
    case 'features':
      return <Features key={section.id} ctx={ctx} section={section} first={first} />;
    case 'categoryGrid':
      return <CategoryGrid key={section.id} ctx={ctx} section={section} first={first} />;
    case 'slideshow':
      return <Slideshow key={section.id} ctx={ctx} section={section} first={first} />;
    default:
      return null;
  }
}
