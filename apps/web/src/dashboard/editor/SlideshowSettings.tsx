'use client';

import {
  MAX_SLIDES,
  SLIDE_ALIGNS,
  SLIDESHOW_HEIGHTS,
  SLIDESHOW_INTERVALS,
  SLIDESHOW_STYLES,
  SLIDESHOW_TONES,
  SLIDESHOW_TRANSITIONS,
  TEXT_LIMITS as L,
  type Section,
  type Slide,
} from '@microstore/site-schema';
import Image from 'next/image';
import { Button, Field, Input, Textarea, Toggle } from '@/components/ui';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Icon, SECTION_PATHS } from './icons';
import { Group, Segmented } from './panels';

type Slideshow = Extract<Section, { type: 'slideshow' }>;
type Props = Slideshow['props'];

const EMPTY_SLIDE: Slide = {
  imageUrl: '',
  eyebrow: '',
  title: 'New slide',
  text: '',
  ctaLabel: '',
  ctaLink: '',
  align: 'center',
};

function Text({
  label,
  value,
  max,
  multiline,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      {(p) =>
        multiline ? (
          <Textarea
            {...p}
            rows={3}
            value={value}
            maxLength={max}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input {...p} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

/** What a slide shows, in a few words, for its row in the list. */
function slideKind(s: Slide) {
  const text = Boolean(s.title || s.text || s.eyebrow);
  const parts = [
    s.imageUrl ? (text ? 'Image + text' : 'Image only') : text ? 'Text only' : 'Empty',
  ];
  if (s.ctaLabel && s.ctaLink) parts.push('button');
  else if (s.ctaLink) parts.push('whole slide links');
  return parts.join(' · ');
}

function SlideEditor({
  storeId,
  slide,
  index,
  count,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  storeId: string;
  slide: Slide;
  index: number;
  count: number;
  onChange: (patch: Partial<Slide>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const empty = !slide.imageUrl && !slide.title && !slide.text && !slide.eyebrow;
  return (
    <details
      className="group rounded-lg border border-neutral-200 bg-white open:shadow-sm"
      open={count <= 1}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-neutral-400">
          {slide.imageUrl ? (
            <Image
              src={slide.imageUrl}
              alt=""
              width={112}
              height={80}
              className="h-full w-full object-cover"
            />
          ) : (
            <Icon d={SECTION_PATHS.richText} className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {slide.title || slide.eyebrow || slide.text || `Slide ${index + 1}`}
          </span>
          <span className={`block text-xs ${empty ? 'text-red-700' : 'text-neutral-500'}`}>
            {slideKind(slide)}
          </span>
        </span>
        <span className="text-neutral-400 transition group-open:rotate-90" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="space-y-4 border-t border-neutral-100 p-3">
        {empty ? (
          <p role="alert" className="text-sm text-red-700">
            Add an image or some text, or remove this slide.
          </p>
        ) : null}
        <ImageUpload
          storeId={storeId}
          purpose="image"
          label="Image"
          value={slide.imageUrl}
          onChange={(url) => onChange({ imageUrl: url })}
        />
        <Text
          label="Small line above the title"
          value={slide.eyebrow}
          max={L.ctaLabel}
          onChange={(v) => onChange({ eyebrow: v })}
        />
        <Text
          label="Title"
          value={slide.title}
          max={L.sectionTitle}
          onChange={(v) => onChange({ title: v })}
        />
        <Text
          label="Text"
          value={slide.text}
          max={L.sectionSubtitle}
          multiline
          onChange={(v) => onChange({ text: v })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Text
            label="Button text"
            value={slide.ctaLabel}
            max={L.ctaLabel}
            onChange={(v) => onChange({ ctaLabel: v })}
          />
          <Text
            label="Link"
            value={slide.ctaLink}
            max={2048}
            hint="/products, /about…"
            onChange={(v) => onChange({ ctaLink: v })}
          />
        </div>
        <p className="-mt-2 text-xs text-neutral-500">
          A link without button text makes the whole slide clickable.
        </p>
        <Segmented
          label="Text position"
          value={slide.align}
          options={SLIDE_ALIGNS}
          labels={{ start: 'Left', center: 'Center', end: 'Right' }}
          onChange={(v) => onChange({ align: v })}
        />
        <div className="flex flex-wrap gap-1 border-t border-neutral-100 pt-3">
          <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
            Move up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            Move down
          </Button>
          <Button variant="ghost" size="sm" disabled={count >= MAX_SLIDES} onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button variant="ghost" size="sm" disabled={count <= 1} onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
    </details>
  );
}

/** Slides plus every look and behaviour option of a slideshow section. */
export function SlideshowSettings({
  storeId,
  section,
  onChange,
}: {
  storeId: string;
  section: Slideshow;
  onChange: (s: Section) => void;
}) {
  const p = section.props;
  const set = (patch: Partial<Props>) => onChange({ ...section, props: { ...p, ...patch } });
  const setSlides = (slides: Slide[]) => set({ slides });
  const cards = p.style === 'cards';
  const hasImages = p.slides.some((s) => s.imageUrl);

  return (
    <>
      <Group title={`Slides (${p.slides.length}/${MAX_SLIDES})`}>
        <p className="text-xs text-neutral-500">
          Each slide can be an image, text, or both, with or without a button. Double-click a slide
          in the preview to edit its text or change its image.
        </p>
        <div className="space-y-2">
          {p.slides.map((slide, i) => (
            <SlideEditor
              key={i}
              storeId={storeId}
              slide={slide}
              index={i}
              count={p.slides.length}
              onChange={(patch) =>
                setSlides(p.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)))
              }
              onMove={(dir) => {
                const next = [...p.slides];
                const [moved] = next.splice(i, 1);
                if (moved) next.splice(i + dir, 0, moved);
                setSlides(next);
              }}
              onDuplicate={() =>
                setSlides([...p.slides.slice(0, i + 1), { ...slide }, ...p.slides.slice(i + 1)])
              }
              onRemove={() => setSlides(p.slides.filter((_, j) => j !== i))}
            />
          ))}
        </div>
        {p.slides.length < MAX_SLIDES ? (
          <Button
            variant="secondary"
            onClick={() =>
              setSlides([...p.slides, { ...EMPTY_SLIDE, title: `Slide ${p.slides.length + 1}` }])
            }
          >
            + Add slide
          </Button>
        ) : null}
      </Group>

      <Group title="Look">
        <Segmented
          label="Style"
          value={p.style}
          options={SLIDESHOW_STYLES}
          labels={{ overlay: 'Text on image', split: 'Side by side', cards: 'Cards' }}
          onChange={(v) => set({ style: v })}
        />
        {cards ? (
          <Field label={`Cards in view on big screens: ${p.perView}`}>
            {(f) => (
              <input
                {...f}
                type="range"
                min={1}
                max={4}
                value={p.perView}
                onChange={(e) => set({ perView: Number(e.target.value) })}
                className="w-full accent-brand-600"
              />
            )}
          </Field>
        ) : (
          <>
            <Segmented
              label="Height"
              value={p.height}
              options={SLIDESHOW_HEIGHTS}
              labels={{ small: 'Small', medium: 'Medium', large: 'Large', screen: 'Full screen' }}
              onChange={(v) => set({ height: v })}
            />
            <Toggle
              label="Full width"
              description="Edge to edge, or inside the page with rounded corners."
              checked={p.fullWidth}
              onChange={(v) => set({ fullWidth: v })}
            />
          </>
        )}
        {p.style === 'split' ? (
          <Segmented
            label="Image side"
            value={p.imageSide}
            options={['left', 'right'] as const}
            onChange={(v) => set({ imageSide: v })}
          />
        ) : null}
        {p.style === 'overlay' && hasImages ? (
          <Field label={`Darken images: ${p.overlay}%`} hint="Keeps white text readable on photos.">
            {(f) => (
              <input
                {...f}
                type="range"
                min={0}
                max={80}
                step={5}
                value={p.overlay}
                onChange={(e) => set({ overlay: Number(e.target.value) })}
                className="w-full accent-brand-600"
              />
            )}
          </Field>
        ) : null}
        <Segmented
          label={cards ? 'Colour of text-only cards' : 'Background without an image'}
          value={p.tone}
          options={SLIDESHOW_TONES}
          labels={{ dark: 'Dark', light: 'Light', primary: 'Brand', secondary: 'Accent' }}
          onChange={(v) => set({ tone: v })}
        />
      </Group>

      <Group title="Motion">
        {cards ? null : (
          <Segmented
            label="Change slides by"
            value={p.transition}
            options={SLIDESHOW_TRANSITIONS}
            labels={{ slide: 'Sliding', fade: 'Fading' }}
            onChange={(v) => set({ transition: v })}
          />
        )}
        <Toggle
          label="Play automatically"
          description="Pauses on hover and for visitors who prefer less motion."
          checked={p.autoplay}
          onChange={(v) => set({ autoplay: v })}
        />
        {p.autoplay ? (
          <Segmented
            label="Time per slide"
            value={String(p.interval) as `${Props['interval']}`}
            options={SLIDESHOW_INTERVALS.map(String) as `${Props['interval']}`[]}
            labels={{ '3': '3 s', '5': '5 s', '7': '7 s', '10': '10 s' }}
            onChange={(v) => set({ interval: Number(v) as Props['interval'] })}
          />
        ) : null}
        <Toggle label="Arrows" checked={p.showArrows} onChange={(v) => set({ showArrows: v })} />
        <Toggle label="Dots" checked={p.showDots} onChange={(v) => set({ showDots: v })} />
      </Group>
    </>
  );
}
