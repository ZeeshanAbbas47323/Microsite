import { TEXT_LIMITS as L, type Slide } from '@microstore/site-schema';
import type { ReactNode } from 'react';
import { imageAttrs, SmartLink, textAttrs } from '../links';
import type { RenderContext, Section } from '../types';
import { variantFor } from '../variants';

type SlideshowSection = Extract<Section, { type: 'slideshow' }>;
type Props = SlideshowSection['props'];

/**
 * Behaviour lives in the storefront's carousel script (`data-ms-carousel`): arrows, dots,
 * autoplay, keyboard and swipe. Without it the slides still scroll and snap by touch or trackpad,
 * and the controls stay hidden. Static CSS only (no merchant text), so inlining it is safe.
 */
const CSS = `.ms-carousel:not([data-ready]) [data-ms-ctrl]{display:none!important}.ms-carousel [data-ms-track]{scrollbar-width:none}.ms-carousel [data-ms-track]::-webkit-scrollbar{display:none}.ms-carousel[data-transition=fade] [data-ms-slide]{transition:opacity .7s ease,visibility .7s}.ms-carousel[data-transition=fade] [data-ms-slide]:not([data-active]){opacity:0;visibility:hidden}[data-ms-dot][aria-current=true] span{width:1.5rem;opacity:1}[data-ms-play][data-playing] .ms-i-play,[data-ms-play]:not([data-playing]) .ms-i-pause{display:none}@media (prefers-reduced-motion:reduce){.ms-carousel [data-ms-track]{scroll-behavior:auto}.ms-carousel[data-transition=fade] [data-ms-slide]{transition:none}}`;

const HEIGHT: Record<Props['height'], string> = {
  small: 'h-[340px] sm:h-[400px]',
  medium: 'h-[440px] sm:h-[540px]',
  large: 'h-[540px] sm:h-[680px]',
  screen: 'h-[calc(100svh-4rem)] min-h-[480px]',
};
const SPLIT_HEIGHT: Record<Props['height'], string> = {
  small: 'md:h-[400px]',
  medium: 'md:h-[520px]',
  large: 'md:h-[640px]',
  screen: 'md:h-[calc(100svh-4rem)] md:min-h-[520px]',
};
const TONE: Record<Props['tone'], string> = {
  dark: 'bg-[#111111] text-white',
  light: 'bg-[var(--ms-surface)] text-[var(--ms-text)]',
  primary: 'bg-[var(--ms-primary)] text-[var(--ms-on-primary)]',
  secondary: 'bg-[var(--ms-secondary)] text-[var(--ms-on-secondary)]',
};
const ALIGN: Record<Slide['align'], string> = {
  start: 'items-start text-start',
  center: 'items-center text-center',
  end: 'items-end text-end',
};

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-[var(--ms-btn-radius)] px-6 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2';
/** A button that stands out on the slide's background (photo, dark, light or brand colour). */
function buttonOn(tone: Props['tone'] | 'image', fallback: string) {
  if (tone === 'image' || tone === 'dark')
    return `${BUTTON} bg-white text-neutral-900 hover:bg-white/90 focus-visible:outline-white`;
  if (tone === 'primary')
    return `${BUTTON} bg-[var(--ms-on-primary)] text-[var(--ms-primary)] hover:opacity-90 focus-visible:outline-current`;
  if (tone === 'secondary')
    return `${BUTTON} bg-[var(--ms-on-secondary)] text-[var(--ms-secondary)] hover:opacity-90 focus-visible:outline-current`;
  return fallback;
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 rtl:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

export function Slideshow({
  ctx,
  section,
  first,
}: {
  ctx: RenderContext;
  section: SlideshowSection;
  first: boolean;
}) {
  const v = variantFor(ctx.config.layoutId);
  const p = section.props;
  const slides = p.slides;
  if (!slides.length) return null;
  const n = slides.length;
  const cards = p.style === 'cards';
  const fade = p.transition === 'fade' && !cards;
  const contained = cards || !p.fullWidth;
  const many = n > 1;
  const Title = p.title ? 'h3' : 'h2';

  // Cards: one and a bit on phones (so people see there is more), then up to `perView`.
  const basis = !cards
    ? 'basis-full'
    : p.perView === 1
      ? 'basis-full'
      : p.perView === 2
        ? 'basis-[82%] sm:basis-[calc((100%_-_1.5rem)/2)]'
        : 'basis-[82%] sm:basis-[calc((100%_-_1.5rem)/2)] lg:basis-[calc((100%_-_(var(--pv)_-_1)*1.5rem)/var(--pv))]';

  const content = (s: Slide, i: number, tone: Props['tone'] | 'image', size: 'big' | 'card') => {
    const path = (key: string) => `slides.${i}.${key}`;
    const big = size === 'big';
    const parts: ReactNode[] = [];
    if (s.eyebrow)
      parts.push(
        <p
          key="e"
          className="text-xs font-bold uppercase tracking-[0.2em] opacity-90"
          {...textAttrs(ctx, path('eyebrow'), L.ctaLabel)}
        >
          {s.eyebrow}
        </p>,
      );
    if (s.title)
      parts.push(
        <Title
          key="t"
          className={
            big
              ? 'max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl'
              : 'text-lg font-semibold leading-snug'
          }
          {...textAttrs(ctx, path('title'), L.sectionTitle)}
        >
          {s.title}
        </Title>,
      );
    if (s.text)
      parts.push(
        <p
          key="x"
          className={`whitespace-pre-line ${big ? 'max-w-xl text-base opacity-90 sm:text-lg' : 'text-sm opacity-80'}`}
          {...textAttrs(ctx, path('text'), L.sectionSubtitle, { multiline: true })}
        >
          {s.text}
        </p>,
      );
    if (s.ctaLabel && s.ctaLink)
      parts.push(
        <div key="b" className={big ? 'pt-2' : 'pt-1'}>
          <SmartLink
            ctx={ctx}
            href={s.ctaLink}
            className={
              big
                ? buttonOn(tone, v.button)
                : 'text-sm font-semibold underline underline-offset-4 hover:no-underline'
            }
          >
            <span {...textAttrs(ctx, path('ctaLabel'), L.ctaLabel)}>{s.ctaLabel}</span>
          </SmartLink>
        </div>,
      );
    return parts;
  };

  // A link without button text makes the whole slide clickable (not in the editor, where clicks
  // select and double-clicks edit).
  const wholeLink = (s: Slide) =>
    s.ctaLink && !s.ctaLabel && !ctx.editable ? (
      <SmartLink ctx={ctx} href={s.ctaLink} className="absolute inset-0 z-10">
        <span className="sr-only">{s.title || s.text || 'Open'}</span>
      </SmartLink>
    ) : null;

  const image = (s: Slide, i: number, className: string, sizes: string) =>
    s.imageUrl ? (
      <ctx.Image
        src={s.imageUrl}
        alt=""
        width={cards ? 800 : 1600}
        height={cards ? 1000 : 900}
        sizes={sizes}
        priority={first && i === 0}
        className={className}
        {...imageAttrs(ctx, `slides.${i}.imageUrl`)}
      />
    ) : null;

  const slide = (s: Slide, i: number) => {
    const hasText = Boolean(s.title || s.text || s.eyebrow || s.ctaLabel);
    const radius = contained ? 'rounded-[var(--ms-radius)]' : '';

    if (p.style === 'split') {
      return (
        <div
          className={`relative grid overflow-hidden md:grid-cols-2 ${TONE[p.tone]} ${SPLIT_HEIGHT[p.height]} ${radius}`}
        >
          <div
            className={`relative aspect-[4/3] md:aspect-auto md:h-full ${p.imageSide === 'right' ? 'md:order-2' : ''}`}
          >
            {image(
              s,
              i,
              'absolute inset-0 h-full w-full object-cover',
              '(min-width: 768px) 50vw, 100vw',
            ) ?? (
              <div
                className="absolute inset-0 bg-[linear-gradient(135deg,var(--ms-primary),var(--ms-secondary))] opacity-80"
                aria-hidden="true"
                {...imageAttrs(ctx, `slides.${i}.imageUrl`)}
              />
            )}
          </div>
          {hasText ? (
            <div className={`flex flex-col justify-center gap-4 p-8 sm:p-12 ${ALIGN[s.align]}`}>
              {content(s, i, p.tone, 'big')}
            </div>
          ) : null}
          {wholeLink(s)}
        </div>
      );
    }

    if (cards) {
      return (
        <div
          className={`group relative flex h-full flex-col overflow-hidden rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-[var(--ms-surface)]`}
        >
          {s.imageUrl ? (
            <div className="overflow-hidden">
              {image(
                s,
                i,
                'aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.03]',
                '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 85vw',
              )}
            </div>
          ) : null}
          {s.imageUrl ? (
            hasText ? (
              <div className={`flex flex-1 flex-col gap-2 p-5 ${ALIGN[s.align]}`}>
                {content(s, i, 'light', 'card')}
              </div>
            ) : null
          ) : (
            <div
              className={`relative flex aspect-[4/5] flex-col justify-center gap-3 p-6 ${TONE[p.tone]} ${ALIGN[s.align]}`}
            >
              <div
                className="absolute inset-0"
                aria-hidden="true"
                {...imageAttrs(ctx, `slides.${i}.imageUrl`)}
              />
              <div className="relative flex flex-col gap-3">{content(s, i, p.tone, 'card')}</div>
            </div>
          )}
          {wholeLink(s)}
        </div>
      );
    }

    // Overlay: text over a photo (darkened so it stays readable), or over the chosen colour.
    return (
      <div
        className={`relative isolate flex overflow-hidden ${HEIGHT[p.height]} ${s.imageUrl ? 'bg-neutral-900 text-white' : TONE[p.tone]} ${radius}`}
      >
        {image(s, i, 'absolute inset-0 -z-10 h-full w-full object-cover', '100vw') ?? (
          <div
            className="absolute inset-0 -z-10"
            aria-hidden="true"
            {...imageAttrs(ctx, `slides.${i}.imageUrl`)}
          />
        )}
        {s.imageUrl && hasText && p.overlay > 0 ? (
          <div
            className="absolute inset-0 -z-10 bg-black"
            style={{ opacity: p.overlay / 100 }}
            aria-hidden="true"
          />
        ) : null}
        {hasText ? (
          <div
            className={`flex w-full flex-col justify-center gap-4 py-14 ${contained ? 'px-8 sm:px-14' : v.container} ${many && p.showArrows ? 'sm:px-20' : ''} ${ALIGN[s.align]}`}
          >
            {content(s, i, s.imageUrl ? 'image' : p.tone, 'big')}
          </div>
        ) : null}
        {wholeLink(s)}
      </div>
    );
  };

  // Controls sit on the photo for text-on-image slides, below the slides otherwise.
  const onSlides = p.style === 'overlay';
  const arrow = (dir: 'prev' | 'next') => (
    <button
      type="button"
      data-ms-ctrl=""
      data-ms-dir={dir}
      aria-label={dir === 'prev' ? 'Previous slide' : 'Next slide'}
      aria-controls={`${section.id}-track`}
      className={`absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/5 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ms-primary)] sm:flex ${dir === 'prev' ? 'start-3' : 'end-3'} ${cards ? (dir === 'prev' ? 'lg:-start-5' : 'lg:-end-5') : ''}`}
    >
      <Chevron dir={dir} />
    </button>
  );

  const bar =
    many && (p.showDots || p.autoplay) ? (
      <div
        data-ms-ctrl=""
        className={
          onSlides
            ? 'absolute inset-x-0 bottom-4 z-20 flex justify-center'
            : 'mt-6 flex justify-center'
        }
      >
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-1 ${onSlides ? 'bg-black/45 text-white backdrop-blur-sm' : 'text-[var(--ms-text)]'}`}
        >
          {p.autoplay ? (
            <button
              type="button"
              data-ms-play=""
              aria-label="Pause slideshow"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/10"
            >
              <svg
                viewBox="0 0 24 24"
                className="ms-i-pause h-3.5 w-3.5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
              </svg>
              <svg
                viewBox="0 0 24 24"
                className="ms-i-play h-3.5 w-3.5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : null}
          {p.showDots
            ? slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  data-ms-dot={i}
                  aria-label={`Show slide ${i + 1} of ${n}`}
                  aria-controls={`${section.id}-track`}
                  className="flex h-7 items-center justify-center px-1"
                >
                  <span className="block h-2 w-2 rounded-full bg-current opacity-45 transition-all duration-300" />
                </button>
              ))
            : null}
        </div>
      </div>
    ) : null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={p.title || 'Slideshow'}
      data-ms-carousel=""
      data-transition={fade ? 'fade' : 'slide'}
      data-autoplay={many && p.autoplay ? String(p.interval) : '0'}
      className={`ms-carousel ${contained ? v.section : ''}`}
      style={{ ['--pv' as string]: String(p.perView) }}
    >
      {many ? <style>{CSS}</style> : null}
      {p.title ? (
        <div className={`${v.container} ${contained ? 'mb-8' : 'mb-6 pt-12'}`}>
          <h2 className={v.heading} {...textAttrs(ctx, 'title', L.sectionTitle)}>
            {p.title}
          </h2>
        </div>
      ) : null}
      <div className={contained ? v.container : ''}>
        <div className="relative">
          <div
            id={`${section.id}-track`}
            data-ms-track=""
            className={
              fade
                ? 'grid'
                : `flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth ${cards ? 'gap-6' : ''}`
            }
          >
            {slides.map((s, i) => (
              <div
                key={i}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${n}`}
                data-ms-slide=""
                data-active={i === 0 ? '' : undefined}
                className={fade ? '[grid-area:1/1]' : `min-w-0 shrink-0 snap-start ${basis}`}
              >
                {slide(s, i)}
              </div>
            ))}
          </div>
          {many && p.showArrows ? (
            <>
              {arrow('prev')}
              {arrow('next')}
            </>
          ) : null}
          {onSlides ? bar : null}
        </div>
        {onSlides ? null : bar}
      </div>
    </section>
  );
}
