'use client';

import {
  BORDER_RADII,
  BUTTON_STYLES,
  contrastRatio,
  FONT_WHITELIST,
  FOOTER_STYLES,
  HEX_COLOR_REGEX,
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
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
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
            className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium capitalize ${value === o ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            {o}
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
              className="cursor-pointer space-y-1.5 rounded-xl border-2 border-transparent p-1 transition has-[:checked]:border-indigo-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300 hover:border-neutral-300"
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

export function FooterSettings({ config, update }: { config: SiteConfig; update: Update }) {
  return (
    <Group title="Footer">
      <Segmented
        label="Style"
        value={config.footer.style}
        options={FOOTER_STYLES}
        onChange={(v) => update((c) => ({ ...c, footer: { ...c.footer, style: v } }))}
      />
      <Field label="Footer text">
        {(p) => (
          <Input
            {...p}
            value={config.footer.text}
            maxLength={200}
            onChange={(e) =>
              update((c) => ({ ...c, footer: { ...c.footer, text: e.target.value } }))
            }
          />
        )}
      </Field>
    </Group>
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
