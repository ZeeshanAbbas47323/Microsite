'use client';

import {
  ANNOUNCEMENT_SPEEDS,
  BORDER_RADII,
  BUTTON_STYLES,
  contrastRatio,
  FONT_WHITELIST,
  FOOTER_ALIGNS,
  FOOTER_STYLES,
  HEX_COLOR_REGEX,
  MAX_ANNOUNCEMENTS,
  TEXT_LIMITS,
  NAVBAR_STYLES,
  type Page,
  type SiteConfig,
} from '@microstore/site-schema';
import { LAYOUTS } from '@microstore/layouts';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  ColorInput,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
  Toggle,
} from '@/components/ui';
import { api } from '../api';
import { LayoutThumb } from '../OnboardingWizard';
import { formatDate } from '../Overview';
import { extractPalette } from './palette';

export type Update = (fn: (c: SiteConfig) => SiteConfig) => void;

/** A titled group of settings inside the sidebar. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-neutral-200 px-4 py-5 last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

export function ContrastHint({ fg, bg }: { fg: string; bg: string }) {
  if (!HEX_COLOR_REGEX.test(fg) || !HEX_COLOR_REGEX.test(bg)) return null;
  const ratio = contrastRatio(fg, bg);
  return ratio < 4.5 ? (
    <Notice tone="error">
      Text may be hard to read (contrast {ratio.toFixed(1)}:1, aim for 4.5:1 or more).
    </Notice>
  ) : null;
}

/** Segmented choice for short enum settings (button style, corners...). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  labels,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  /** Display names; defaults to the option itself. */
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-neutral-800">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${labels ? '' : 'capitalize'} ${value === o ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            {labels?.[o] ?? o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ThemeSettings({ config, update }: { config: SiteConfig; update: Update }) {
  const t = config.theme;
  const setTheme = (patch: Partial<SiteConfig['theme']>) =>
    update((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
  return (
    <>
      <Group title="Layout">
        <p className="text-xs text-neutral-500">Switching keeps your content and colors.</p>
        <div className="grid grid-cols-2 gap-3">
          {LAYOUTS.map(({ id, name }) => (
            <label
              key={id}
              className="cursor-pointer space-y-1.5 rounded-xl border-2 border-transparent p-1 transition has-[:checked]:border-brand-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300 hover:border-neutral-300"
            >
              <input
                type="radio"
                name="layoutId"
                className="sr-only"
                checked={config.layoutId === id}
                onChange={() => update((c) => ({ ...c, layoutId: id }))}
              />
              <LayoutThumb
                id={id}
                name={config.business.name}
                primary={t.primaryColor}
                secondary={t.secondaryColor}
              />
              <span className="block px-1 text-sm font-medium">{name}</span>
            </label>
          ))}
        </div>
      </Group>
      <Group title="Colors">
        <div className="grid grid-cols-2 gap-4">
          <ColorInput
            label="Primary"
            value={t.primaryColor}
            onChange={(v) => setTheme({ primaryColor: v })}
          />
          <ColorInput
            label="Secondary"
            value={t.secondaryColor}
            onChange={(v) => setTheme({ secondaryColor: v })}
          />
          <ColorInput
            label="Background"
            value={t.backgroundColor}
            onChange={(v) => setTheme({ backgroundColor: v })}
          />
          <ColorInput
            label="Text"
            value={t.textColor}
            onChange={(v) => setTheme({ textColor: v })}
          />
        </div>
        <ContrastHint fg={t.textColor} bg={t.backgroundColor} />
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:border-brand-400 hover:bg-brand-50/40 focus-within:ring-2 focus-within:ring-brand-300">
          <span aria-hidden="true">🎨</span> Colors from a logo or photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const [primary, secondary] = await extractPalette(file, 2).catch(() => []);
              if (primary)
                setTheme({
                  primaryColor: primary,
                  ...(secondary ? { secondaryColor: secondary } : {}),
                });
            }}
          />
        </label>
      </Group>
      <Group title="Typography">
        <Field label="Font">
          {(p) => (
            <Select
              {...p}
              value={t.fontFamily}
              onChange={(e) =>
                setTheme({ fontFamily: e.target.value as SiteConfig['theme']['fontFamily'] })
              }
            >
              {FONT_WHITELIST.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          )}
        </Field>
        <p
          className="rounded-lg bg-neutral-50 p-3 text-lg"
          style={{ fontFamily: `'${t.fontFamily}', system-ui, sans-serif` }}
        >
          The quick brown fox · آپ کا اسٹور
        </p>
      </Group>
      <Group title="Buttons and corners">
        <Segmented
          label="Button shape"
          value={t.buttonStyle}
          options={BUTTON_STYLES}
          onChange={(v) => setTheme({ buttonStyle: v })}
        />
        <Segmented
          label="Corner rounding"
          value={t.borderRadius}
          options={BORDER_RADII}
          onChange={(v) => setTheme({ borderRadius: v })}
        />
      </Group>
    </>
  );
}

export function HeaderSettings({ config, update }: { config: SiteConfig; update: Update }) {
  const n = config.navbar;
  const setNav = (patch: Partial<SiteConfig['navbar']>) =>
    update((c) => ({ ...c, navbar: { ...c.navbar, ...patch } }));
  return (
    <>
      <Group title="Style">
        <Segmented
          label="Menu layout"
          value={n.style}
          options={NAVBAR_STYLES}
          onChange={(v) => setNav({ style: v })}
        />
        <Toggle
          label="Stay at the top when scrolling"
          checked={n.sticky}
          onChange={(v) => setNav({ sticky: v })}
        />
        <Toggle
          label="Show cart icon"
          checked={n.showCart}
          onChange={(v) => setNav({ showCart: v })}
        />
      </Group>
      <Group title="Colors">
        <div className="grid grid-cols-2 gap-4">
          <ColorInput
            label="Background"
            value={n.backgroundColor}
            onChange={(v) => setNav({ backgroundColor: v })}
          />
          <ColorInput label="Text" value={n.textColor} onChange={(v) => setNav({ textColor: v })} />
        </div>
        <ContrastHint fg={n.textColor} bg={n.backgroundColor} />
      </Group>
      <Group title="Menu">
        <p className="text-sm text-neutral-600">
          The menu lists your pages in order. Rename a page in its page settings.
        </p>
      </Group>
    </>
  );
}

const isOkLink = (v: string) => v === '' || v.startsWith('/') || /^https?:\/\/\S+$/i.test(v);

/** Announcement bar above the header: on/off, up to five rotating messages, colours and speed. */
export function AnnouncementSettings({ config, update }: { config: SiteConfig; update: Update }) {
  const a = config.announcement;
  const set = (patch: Partial<SiteConfig['announcement']>) =>
    update((c) => ({ ...c, announcement: { ...c.announcement, ...patch } }));
  const setMessage = (i: number, patch: Partial<SiteConfig['announcement']['messages'][number]>) =>
    set({ messages: a.messages.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const move = (i: number, to: number) => {
    const next = [...a.messages];
    const [m] = next.splice(i, 1);
    if (m) next.splice(to, 0, m);
    set({ messages: next });
  };
  const max = TEXT_LIMITS.announcement;

  return (
    <>
      <Group title="Bar">
        <Toggle
          label="Show announcement bar"
          description="A thin strip above the header on every page."
          checked={a.enabled}
          onChange={(v) =>
            set(
              v && a.messages.length === 0
                ? {
                    enabled: true,
                    messages: [{ text: 'Cash on delivery all over Pakistan', link: '' }],
                  }
                : { enabled: v },
            )
          }
        />
      </Group>

      <Group title={`Messages (${a.messages.length}/${MAX_ANNOUNCEMENTS})`}>
        {a.messages.length > 1 ? (
          <p className="text-xs text-neutral-600">
            Messages take turns like a carousel. They pause while a visitor hovers over the bar.
          </p>
        ) : null}
        <ol className="space-y-3">
          {a.messages.map((m, i) => {
            const textError = m.text.trim() === '' ? 'Write a message or remove it.' : undefined;
            const linkError = isOkLink(m.link.trim())
              ? undefined
              : 'Use a store path like /products or a full https:// link.';
            return (
              <li key={i} className="rounded-lg border border-neutral-200 p-3">
                <div className="mb-2 flex items-center gap-1">
                  <span className="flex-1 text-xs font-semibold text-neutral-600">
                    Message {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Move message ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    className="rounded-md px-1.5 py-0.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move message ${i + 1} down`}
                    disabled={i === a.messages.length - 1}
                    onClick={() => move(i, i + 1)}
                    className="rounded-md px-1.5 py-0.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove message ${i + 1}`}
                    onClick={() => set({ messages: a.messages.filter((_, j) => j !== i) })}
                    className="rounded-md px-1.5 py-0.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
                <div className="space-y-3">
                  <Field
                    label="Text"
                    hint={`${max - m.text.length} characters left`}
                    error={textError}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        value={m.text}
                        maxLength={max}
                        placeholder="e.g. Free delivery on orders over Rs 3,000"
                        onChange={(e) => setMessage(i, { text: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Link" optional error={linkError}>
                    {(p) => (
                      <Input
                        {...p}
                        value={m.link}
                        placeholder="/products"
                        onChange={(e) => setMessage(i, { link: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
              </li>
            );
          })}
        </ol>
        <Button
          variant="secondary"
          size="sm"
          disabled={a.messages.length >= MAX_ANNOUNCEMENTS}
          onClick={() => set({ messages: [...a.messages, { text: '', link: '' }] })}
        >
          + Add message
        </Button>
      </Group>

      <Group title="Rotation">
        <Segmented
          label="Each message shows for"
          value={String(a.speed)}
          options={ANNOUNCEMENT_SPEEDS.map((n) => `${n}`)}
          onChange={(v) => set({ speed: Number(v) as SiteConfig['announcement']['speed'] })}
        />
        <p className="text-xs text-neutral-600">Seconds. Only used with two or more messages.</p>
      </Group>

      <Group title="Colors">
        <div className="grid grid-cols-2 gap-4">
          <ColorInput
            label="Background"
            value={a.backgroundColor}
            onChange={(v) => set({ backgroundColor: v })}
          />
          <ColorInput label="Text" value={a.textColor} onChange={(v) => set({ textColor: v })} />
        </div>
        <ContrastHint fg={a.textColor} bg={a.backgroundColor} />
        <button
          type="button"
          onClick={() =>
            set({
              backgroundColor: config.theme.primaryColor,
              textColor: config.navbar.backgroundColor,
            })
          }
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Use my brand colours
        </button>
      </Group>
    </>
  );
}

export function FooterSettings({ config, update }: { config: SiteConfig; update: Update }) {
  const setFooter = (patch: Partial<SiteConfig['footer']>) =>
    update((c) => ({ ...c, footer: { ...c.footer, ...patch } }));
  return (
    <>
      <Group title="Style">
        <Segmented
          label="Layout"
          value={config.footer.style}
          options={FOOTER_STYLES}
          onChange={(v) => setFooter({ style: v })}
        />
        <p className="text-xs text-neutral-500">
          Columns shows your brand, pages, help links and contact details side by side.
        </p>
      </Group>
      <Group title="Brand">
        <Field
          label="About your brand"
          hint={`Shown under your store name. ${300 - (config.footer.about ?? '').length} characters left.`}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              value={config.footer.about ?? ''}
              maxLength={300}
              placeholder={
                config.business.tagline || 'e.g. Handmade leather goods from Lahore since 2015.'
              }
              onChange={(e) => setFooter({ about: e.target.value })}
            />
          )}
        </Field>
        {!config.footer.about && config.business.tagline ? (
          <p className="text-xs text-neutral-500">
            Empty: your tagline “{config.business.tagline}” is shown instead.
          </p>
        ) : null}
      </Group>
      <Group title="Bottom line">
        <Field label="Footer text" hint="e.g. © 2026 Your Store. All rights reserved.">
          {(p) => (
            <Input
              {...p}
              value={config.footer.text}
              maxLength={200}
              onChange={(e) => setFooter({ text: e.target.value })}
            />
          )}
        </Field>
        <Segmented
          label="Alignment"
          value={config.footer.bottomAlign}
          options={FOOTER_ALIGNS}
          onChange={(v) => setFooter({ bottomAlign: v })}
        />
        <p className="text-xs text-neutral-500">
          Auto uses the footer style’s own alignment. Left and right swap for right-to-left stores.
        </p>
      </Group>
      <Group title="Also in the footer">
        <ul className="list-disc space-y-1 ps-5 text-sm text-neutral-600">
          <li>Links to your pages, in menu order (rename them in Page settings).</li>
          <li>“Track your order” and cart links.</li>
          <li>
            Phone, WhatsApp, email, address and social links from{' '}
            <a href="/dashboard/settings" className="font-medium text-brand-700 underline">
              Settings → Business details
            </a>
            .
          </li>
        </ul>
      </Group>
    </>
  );
}

export function PageSettings({
  page,
  setPage,
  onRemove,
}: {
  page: Page;
  setPage: (fn: (p: Page) => Page) => void;
  onRemove: (() => void) | null;
}) {
  return (
    <>
      <Group title="Page">
        <Field label="Name in the menu">
          {(p) => (
            <Input
              {...p}
              value={page.title}
              maxLength={60}
              onChange={(e) => setPage((pg) => ({ ...pg, title: e.target.value }))}
            />
          )}
        </Field>
        <p className="text-xs text-neutral-500">
          Address: <code>/{page.slug === 'home' ? '' : page.slug}</code>
        </p>
      </Group>
      <Group title="Search engines">
        <Field label="Title" optional hint="Shown in Google and browser tabs.">
          {(p) => (
            <Input
              {...p}
              value={page.seo.title}
              maxLength={70}
              onChange={(e) =>
                setPage((pg) => ({ ...pg, seo: { ...pg.seo, title: e.target.value } }))
              }
            />
          )}
        </Field>
        <Field label="Description" optional>
          {(p) => (
            <Textarea
              {...p}
              value={page.seo.description}
              maxLength={160}
              onChange={(e) =>
                setPage((pg) => ({ ...pg, seo: { ...pg.seo, description: e.target.value } }))
              }
            />
          )}
        </Field>
      </Group>
      {onRemove ? (
        <Group title="Danger zone">
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Remove the “${page.title}” page?`)) onRemove();
            }}
          >
            Remove page
          </Button>
        </Group>
      ) : null}
    </>
  );
}

interface Version {
  id: string;
  kind: 'published' | 'draft_revision';
  source: string;
  createdAt: string;
}

const SOURCE: Record<string, string> = {
  generate: 'Created',
  manual: 'Edited',
  publish: 'Published',
  restore: 'Restored',
  command: 'AI assistant',
};

export function HistoryPanel({
  storeId,
  dirty,
  onRestored,
}: {
  storeId: string;
  dirty: boolean;
  onRestored: () => Promise<void>;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    api<{ versions: Version[] }>(`/stores/${storeId}/versions`)
      .then((r) => setVersions(r.versions))
      .catch(() => setVersions([]));
  }, [storeId, restoring]);

  async function restore(id: string) {
    if (dirty && !confirm('Restoring replaces your unsaved changes. Continue?')) return;
    setRestoring(id);
    try {
      await api(`/stores/${storeId}/versions/${id}/restore`, { method: 'POST' });
      await onRestored();
    } finally {
      setRestoring(null);
    }
  }

  if (!versions) return <p className="p-4 text-sm text-neutral-500">Loading…</p>;
  return (
    <ol className="space-y-2 p-4">
      {versions.map((v) => (
        <li
          key={v.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 text-sm"
        >
          <div>
            <p className="font-medium">
              {SOURCE[v.source] ?? v.source}{' '}
              {v.kind === 'published' ? <Badge tone="green">Live version</Badge> : null}
            </p>
            <p className="text-xs text-neutral-500">{formatDate(v.createdAt)}</p>
          </div>
          <Button variant="secondary" onClick={() => restore(v.id)} loading={restoring === v.id}>
            Restore
          </Button>
        </li>
      ))}
    </ol>
  );
}
