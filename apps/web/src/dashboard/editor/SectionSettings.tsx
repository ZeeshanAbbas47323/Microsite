'use client';

import {
  FEATURE_ICONS,
  SECTION_INFO,
  type FeatureIcon,
  type Section,
} from '@microstore/site-schema';
import { Button, Field, Input, Select, Textarea, Toggle } from '@/components/ui';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Group, Segmented } from './panels';

type Props = Record<string, unknown>;

function TextField({
  label,
  value,
  max,
  multiline = false,
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
            rows={4}
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

/** Repeating items (FAQ, testimonials, features) with add / remove / reorder. */
function ItemsEditor<T extends Record<string, string>>({
  label,
  items,
  fields,
  empty,
  onChange,
  max,
  render,
}: {
  label: string;
  items: T[];
  fields: [keyof T & string, string, boolean][];
  empty: T;
  onChange: (items: T[]) => void;
  max: number;
  /** Extra controls for one item (e.g. the icon picker). */
  render?: (item: T, set: (patch: Partial<T>) => void, i: number) => React.ReactNode;
}) {
  const set = (i: number, patch: Partial<T>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const [moved] = next.splice(i, 1);
    next.splice(i + dir, 0, moved as T);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <details
          key={i}
          className="group rounded-lg border border-neutral-200 bg-white open:shadow-sm"
          open={items.length <= 2}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="text-neutral-400 transition group-open:rotate-90" aria-hidden="true">
              ›
            </span>
            <span className="flex-1 truncate">
              {String(item[fields[0]?.[0] as keyof T] ?? '') || `${label} ${i + 1}`}
            </span>
          </summary>
          <div className="space-y-3 border-t border-neutral-100 p-3">
            {render?.(item, (patch) => set(i, patch), i)}
            {fields.map(([key, fieldLabel, multiline]) => (
              <TextField
                key={key}
                label={fieldLabel}
                value={item[key] ?? ''}
                max={multiline ? 600 : 240}
                multiline={multiline}
                onChange={(v) => set(i, { [key]: v } as Partial<T>)}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                Move up
              </Button>
              <Button variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                Move down
              </Button>
              <Button variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </div>
        </details>
      ))}
      {items.length < max ? (
        <Button variant="secondary" onClick={() => onChange([...items, { ...empty }])}>
          + Add {label.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}

const ICON_LABELS: Record<FeatureIcon, string> = {
  truck: 'Delivery',
  cash: 'Cash',
  exchange: 'Exchange',
  shield: 'Shield',
  star: 'Star',
  phone: 'Phone',
  gift: 'Gift',
  leaf: 'Leaf',
  clock: 'Clock',
  heart: 'Heart',
};

/** All settings for one section, grouped like a theme editor. */
export function SectionSettings({
  storeId,
  section,
  onChange,
}: {
  storeId: string;
  section: Section;
  onChange: (s: Section) => void;
}) {
  const props = section.props as Props;
  const setProp = (key: string, value: unknown) =>
    onChange({ ...section, props: { ...props, [key]: value } } as Section);
  const str = (key: string) => String(props[key] ?? '');

  const content: React.ReactNode[] = [];
  const buttons: React.ReactNode[] = [];

  if (section.type === 'hero') {
    content.push(
      <TextField
        key="eyebrow"
        label="Small line above the title"
        value={str('eyebrow')}
        max={40}
        hint="e.g. New collection"
        onChange={(v) => setProp('eyebrow', v)}
      />,
    );
  }
  if ('title' in props)
    content.push(
      <TextField
        key="title"
        label="Heading"
        value={str('title')}
        max={120}
        onChange={(v) => setProp('title', v)}
      />,
    );
  if ('subtitle' in props)
    content.push(
      <TextField
        key="subtitle"
        label={section.type === 'hero' ? 'Text under the heading' : 'Subheading'}
        value={str('subtitle')}
        max={240}
        multiline
        onChange={(v) => setProp('subtitle', v)}
      />,
    );
  if ('body' in props)
    content.push(
      <TextField
        key="body"
        label="Text"
        value={str('body')}
        max={2000}
        multiline
        onChange={(v) => setProp('body', v)}
      />,
    );
  if (Array.isArray(props.paragraphs))
    content.push(
      <Field key="paragraphs" label="Text" hint="Leave an empty line between paragraphs.">
        {(p) => (
          <Textarea
            {...p}
            rows={8}
            value={(props.paragraphs as string[]).join('\n\n')}
            onChange={(e) =>
              setProp(
                'paragraphs',
                e.target.value
                  .split(/\n\s*\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              )
            }
          />
        )}
      </Field>,
    );

  if ('ctaLabel' in props) {
    buttons.push(
      <div key="cta" className="grid grid-cols-2 gap-3">
        <TextField
          label="Button text"
          value={str('ctaLabel')}
          max={40}
          onChange={(v) => setProp('ctaLabel', v)}
        />
        <TextField
          label="Button link"
          value={str('ctaLink')}
          max={2048}
          hint="/products, /about…"
          onChange={(v) => setProp('ctaLink', v)}
        />
      </div>,
    );
  }
  if (section.type === 'hero') {
    buttons.push(
      <div key="cta2" className="grid grid-cols-2 gap-3">
        <TextField
          label="Second button text"
          value={str('secondaryCtaLabel')}
          max={40}
          onChange={(v) => setProp('secondaryCtaLabel', v)}
        />
        <TextField
          label="Second button link"
          value={str('secondaryCtaLink')}
          max={2048}
          onChange={(v) => setProp('secondaryCtaLink', v)}
        />
      </div>,
    );
  }

  return (
    <>
      <Group title="Content">
        {content.length ? content : null}
        {section.type === 'contactInfo' ? (
          <p className="text-sm text-neutral-600">
            Phone, WhatsApp, email and address come from Settings → Business details.
          </p>
        ) : null}
        {section.type === 'categoryGrid' ? (
          <p className="text-sm text-neutral-600">
            Tiles are made from your Getorio product categories, each with one product photo.
          </p>
        ) : null}
      </Group>

      {'imageUrl' in props ? (
        <Group title="Image">
          <ImageUpload
            storeId={storeId}
            purpose="image"
            label="Image"
            value={str('imageUrl')}
            onChange={(url) => setProp('imageUrl', url)}
          />
          {section.type === 'imageText' ? (
            <Segmented
              label="Image side"
              value={section.props.imagePosition}
              options={['left', 'right'] as const}
              onChange={(v) => setProp('imagePosition', v)}
            />
          ) : null}
        </Group>
      ) : null}

      {buttons.length ? <Group title="Buttons">{buttons}</Group> : null}

      {section.type === 'productGrid' ? (
        <Group title="Products">
          <Segmented
            label="Show"
            value={section.props.source === 'category' ? 'all' : section.props.source}
            options={['featured', 'latest', 'all'] as const}
            onChange={(v) => setProp('source', v)}
          />
          <Field label={`How many: ${section.props.limit}`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={1}
                max={24}
                value={section.props.limit}
                onChange={(e) => setProp('limit', Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            )}
          </Field>
        </Group>
      ) : null}

      {section.type === 'categoryGrid' ? (
        <Group title="Tiles">
          <Field label={`Up to ${section.props.limit} categories`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={2}
                max={8}
                value={section.props.limit}
                onChange={(e) => setProp('limit', Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            )}
          </Field>
        </Group>
      ) : null}

      {section.type === 'banner' ? (
        <Group title="Style">
          <Segmented
            label="Color"
            value={section.props.tone}
            options={['primary', 'secondary', 'neutral'] as const}
            onChange={(v) => setProp('tone', v)}
          />
        </Group>
      ) : null}

      {section.type === 'contactInfo' ? (
        <Group title="Show">
          <Toggle
            label="WhatsApp"
            checked={section.props.showWhatsapp}
            onChange={(v) => setProp('showWhatsapp', v)}
          />
          <Toggle
            label="Social links"
            checked={section.props.showSocial}
            onChange={(v) => setProp('showSocial', v)}
          />
        </Group>
      ) : null}

      {section.type === 'features' ? (
        <Group title="Items">
          <ItemsEditor
            label="Item"
            items={section.props.items}
            fields={[
              ['title', 'Title', false],
              ['text', 'Text', true],
            ]}
            empty={{ icon: 'star', title: 'New promise', text: '' }}
            onChange={(items) => setProp('items', items)}
            max={6}
            render={(item, set) => (
              <Field label="Icon">
                {(p) => (
                  <Select
                    {...p}
                    value={item.icon}
                    onChange={(e) => set({ icon: e.target.value as FeatureIcon })}
                  >
                    {FEATURE_ICONS.map((icon) => (
                      <option key={icon} value={icon}>
                        {ICON_LABELS[icon]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          />
        </Group>
      ) : null}

      {section.type === 'faq' ? (
        <Group title="Questions">
          <ItemsEditor
            label="Question"
            items={section.props.items}
            fields={[
              ['question', 'Question', false],
              ['answer', 'Answer', true],
            ]}
            empty={{ question: 'New question', answer: 'Answer' }}
            onChange={(items) => setProp('items', items)}
            max={20}
          />
        </Group>
      ) : null}

      {section.type === 'testimonials' ? (
        <Group title="Quotes">
          <p className="text-xs text-neutral-500">Only use real words from real customers.</p>
          <ItemsEditor
            label="Quote"
            items={section.props.items}
            fields={[
              ['author', 'Name', false],
              ['quote', 'Quote', true],
              ['role', 'City or role', false],
            ]}
            empty={{ quote: 'What your customer said', author: 'Customer', role: '' }}
            onChange={(items) => setProp('items', items)}
            max={12}
          />
        </Group>
      ) : null}
    </>
  );
}

export function sectionTitle(section: Section): string {
  const title = (section.props as Props).title;
  return typeof title === 'string' && title ? title : SECTION_INFO[section.type].label;
}
