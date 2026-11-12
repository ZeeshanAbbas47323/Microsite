'use client';

import {
  BORDER_RADII,
  BUTTON_STYLES,
  contrastRatio,
  createOptionalPage,
  FONT_WHITELIST,
  FOOTER_STYLES,
  HEX_COLOR_REGEX,
  MAX_CONTENT_PAGES,
  NAVBAR_STYLES,
  type BusinessCategory,
  type Page,
  type Section,
  type SiteConfig,
} from '@microstore/site-schema';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { ImageUpload } from '@/components/ui/ImageUpload';
import { api, ApiError } from './api';
import { formatDate } from './Overview';
import { useDashboard } from './session';
import { useStoreActions } from './useStoreActions';

type Tab = 'theme' | 'header' | 'pages' | 'history';
interface Version {
  id: string;
  kind: 'published' | 'draft_revision';
  source: string;
  createdAt: string;
}

const SECTION_LABELS: Record<Section['type'], string> = {
  hero: 'Hero banner',
  productGrid: 'Product grid',
  richText: 'Text',
  imageText: 'Image with text',
  contactInfo: 'Contact details',
  faq: 'FAQ',
  testimonials: 'Testimonials',
  banner: 'Announcement',
};

const LAYOUT_NAMES: Record<string, string> = { 'bold-01': 'Bold', 'classic-01': 'Classic' };

/** FR-6.2: design editor with live draft preview. Changes are saved to the draft, never live. */
export function DesignEditor() {
  const { store, refreshStore } = useDashboard();
  const params = useSearchParams();
  const { publish, busy: publishing, error: publishError } = useStoreActions();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: ReactNode } | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>('theme');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const storeId = store?.id;

  const load = useCallback(async () => {
    if (!storeId) return;
    const res = await api<{ config: SiteConfig }>(`/stores/${storeId}/config/draft`);
    setConfig(res.config);
    setDirty(false);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!storeId) return;
    const issue = () =>
      api<{ url: string | null }>(`/stores/${storeId}/preview-token`, { method: 'POST' })
        .then((r) => setPreviewUrl(r.url))
        .catch(() => setPreviewUrl(null));
    void issue();
    const t = setInterval(issue, 45 * 60 * 1000); // tokens live 1 h
    return () => clearInterval(t);
  }, [storeId]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = (fn: (c: SiteConfig) => SiteConfig) => {
    setConfig((c) => (c ? fn(structuredClone(c)) : c));
    setDirty(true);
    setMessage(null);
  };

  async function save(): Promise<boolean> {
    if (!storeId || !config) return false;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<{ config: SiteConfig }>(`/stores/${storeId}/config/draft`, {
        method: 'PUT',
        body: { config },
      });
      setConfig(res.config);
      setDirty(false);
      setPreviewKey((k) => k + 1);
      await refreshStore();
      setMessage({ tone: 'success', text: 'Draft saved. Publish to make it live.' });
      return true;
    } catch (e) {
      const details =
        e instanceof ApiError && Array.isArray(e.details)
          ? (e.details as { path: string; message: string }[])
          : [];
      setMessage({
        tone: 'error',
        text: (
          <>
            {e instanceof Error ? e.message : 'Could not save.'}
            {details.length ? (
              <ul className="mt-1 list-disc ps-5">
                {details.slice(0, 5).map((d, i) => (
                  <li key={i}>
                    <code>{d.path}</code>: {d.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndPublish() {
    if (dirty && !(await save())) return;
    const s = await publish();
    if (s)
      setMessage({ tone: 'success', text: 'Published. Your store is live with these changes.' });
  }

  if (!store || !config) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Design</h1>
          {dirty ? (
            <Badge tone="amber">Unsaved changes</Badge>
          ) : store.hasUnpublishedChanges ? (
            <Badge tone="indigo">Draft not published</Badge>
          ) : (
            <Badge tone="green">Up to date</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={save} loading={saving} disabled={!dirty}>
            Save draft
          </Button>
          <Button
            onClick={saveAndPublish}
            loading={publishing === 'publish'}
            disabled={
              store.status === 'suspended' ||
              (!dirty && !store.hasUnpublishedChanges && store.status === 'published')
            }
          >
            Publish
          </Button>
        </div>
      </div>
      {params.get('welcome') ? (
        <Notice tone="success">
          Your store is ready as a draft. Adjust the design, then press Publish when you are happy.
        </Notice>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {publishError ? <Notice tone="error">{publishError}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white shadow-xs">
          <div
            role="tablist"
            aria-label="Design settings"
            className="flex border-b border-neutral-200"
          >
            {(
              [
                ['theme', 'Theme'],
                ['header', 'Header & footer'],
                ['pages', 'Pages'],
                ['history', 'History'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`flex-1 px-2 py-3 text-sm font-medium ${tab === id ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="max-h-[70vh] space-y-5 overflow-y-auto p-5"
          >
            {tab === 'theme' ? <ThemePanel config={config} update={update} /> : null}
            {tab === 'header' ? <HeaderFooterPanel config={config} update={update} /> : null}
            {tab === 'pages' ? (
              <PagesPanel config={config} update={update} storeId={store.id} />
            ) : null}
            {tab === 'history' ? (
              <HistoryPanel
                storeId={store.id}
                dirty={dirty}
                onRestored={async () => {
                  await load();
                  await refreshStore();
                  setPreviewKey((k) => k + 1);
                  setMessage({ tone: 'success', text: 'Version restored into your draft.' });
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>
              {dirty
                ? 'Preview shows your last saved draft. Save to update it.'
                : 'Live preview of your draft'}
            </span>
            <div className="flex gap-1" role="group" aria-label="Preview size">
              {(['desktop', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                  className={`rounded-md px-2.5 py-1 capitalize ${device === d ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-200'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center rounded-xl border border-neutral-200 bg-neutral-100 p-2">
            {previewUrl ? (
              <iframe
                key={previewKey}
                src={previewUrl}
                title="Store preview"
                className={`h-[72vh] rounded-lg border border-neutral-200 bg-white ${device === 'mobile' ? 'w-[390px]' : 'w-full'}`}
              />
            ) : (
              <p className="p-10 text-sm text-neutral-500">Preparing preview…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type Update = (fn: (c: SiteConfig) => SiteConfig) => void;

function ContrastHint({ fg, bg }: { fg: string; bg: string }) {
  if (!HEX_COLOR_REGEX.test(fg) || !HEX_COLOR_REGEX.test(bg)) return null;
  const ratio = contrastRatio(fg, bg);
  return ratio < 4.5 ? (
    <Notice tone="error">
      Text may be hard to read (contrast {ratio.toFixed(1)}:1, aim for 4.5:1 or more).
    </Notice>
  ) : null;
}

function ThemePanel({ config, update }: { config: SiteConfig; update: Update }) {
  const t = config.theme;
  const setTheme = (patch: Partial<SiteConfig['theme']>) =>
    update((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Layout</legend>
        <p className="text-xs text-neutral-500">Switching keeps your content and colors.</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(LAYOUT_NAMES).map(([id, name]) => (
            <label
              key={id}
              className="cursor-pointer rounded-lg border-2 border-neutral-200 p-3 text-sm font-medium has-[:checked]:border-indigo-600"
            >
              <input
                type="radio"
                name="layoutId"
                className="sr-only"
                checked={config.layoutId === id}
                onChange={() => update((c) => ({ ...c, layoutId: id }))}
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
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
        <ColorInput label="Text" value={t.textColor} onChange={(v) => setTheme({ textColor: v })} />
      </div>
      <ContrastHint fg={t.textColor} bg={t.backgroundColor} />
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Buttons">
          {(p) => (
            <Select
              {...p}
              value={t.buttonStyle}
              onChange={(e) =>
                setTheme({ buttonStyle: e.target.value as SiteConfig['theme']['buttonStyle'] })
              }
            >
              {BUTTON_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Corners">
          {(p) => (
            <Select
              {...p}
              value={t.borderRadius}
              onChange={(e) =>
                setTheme({ borderRadius: e.target.value as SiteConfig['theme']['borderRadius'] })
              }
            >
              {BORDER_RADII.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </>
  );
}

function HeaderFooterPanel({ config, update }: { config: SiteConfig; update: Update }) {
  const n = config.navbar;
  const setNav = (patch: Partial<SiteConfig['navbar']>) =>
    update((c) => ({ ...c, navbar: { ...c.navbar, ...patch } }));
  return (
    <>
      <h3 className="text-sm font-semibold">Navigation bar</h3>
      <Field label="Style">
        {(p) => (
          <Select
            {...p}
            value={n.style}
            onChange={(e) => setNav({ style: e.target.value as SiteConfig['navbar']['style'] })}
          >
            {NAVBAR_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <ColorInput
          label="Background"
          value={n.backgroundColor}
          onChange={(v) => setNav({ backgroundColor: v })}
        />
        <ColorInput label="Text" value={n.textColor} onChange={(v) => setNav({ textColor: v })} />
      </div>
      <ContrastHint fg={n.textColor} bg={n.backgroundColor} />
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
      <hr className="border-neutral-200" />
      <h3 className="text-sm font-semibold">Footer</h3>
      <Field label="Style">
        {(p) => (
          <Select
            {...p}
            value={config.footer.style}
            onChange={(e) =>
              update((c) => ({
                ...c,
                footer: { ...c.footer, style: e.target.value as SiteConfig['footer']['style'] },
              }))
            }
          >
            {FOOTER_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
      </Field>
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
    </>
  );
}

function PagesPanel({
  config,
  update,
  storeId,
}: {
  config: SiteConfig;
  update: Update;
  storeId: string;
}) {
  const [selected, setSelected] = useState(0);
  const page = config.pages[selected] ?? config.pages[0];
  const pageIndex = config.pages.indexOf(page as Page);
  const has = (t: Page['template']) => config.pages.some((p) => p.template === t);
  const canAdd = config.pages.length < MAX_CONTENT_PAGES;
  const [customTitle, setCustomTitle] = useState('');

  const setPage = (fn: (p: Page) => Page) =>
    update((c) => ({
      ...c,
      pages: c.pages.map((p, i) => (i === pageIndex ? fn(structuredClone(p)) : p)),
    }));

  function addPage(template: 'about' | 'contact' | 'custom') {
    const b = config.business;
    const store = {
      name: b.name,
      description: b.description,
      category: b.category as BusinessCategory,
      city: b.contact.city,
      hasWhatsapp: b.contact.whatsapp !== '',
    };
    const title = customTitle.trim() || 'Policies';
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'page';
    const newPage = createOptionalPage(
      template,
      store,
      template === 'custom' ? { title, slug } : undefined,
    );
    update((c) => ({ ...c, pages: [...c.pages, newPage] }));
    setSelected(config.pages.length);
  }

  if (!page) return null;
  return (
    <>
      <Field label="Page">
        {(p) => (
          <Select {...p} value={pageIndex} onChange={(e) => setSelected(Number(e.target.value))}>
            {config.pages.map((pg, i) => (
              <option key={pg.slug} value={i}>
                {pg.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="space-y-4 rounded-lg bg-neutral-50 p-3">
        <Field label="Menu title">
          {(p) => (
            <Input
              {...p}
              value={page.title}
              maxLength={60}
              onChange={(e) => setPage((pg) => ({ ...pg, title: e.target.value }))}
            />
          )}
        </Field>
        <Field label="Search title" optional hint="Shown in Google and browser tabs.">
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
        <Field label="Search description" optional>
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
        {page.template !== 'home' && page.template !== 'products' ? (
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm(`Remove the “${page.title}” page?`)) return;
              update((c) => ({ ...c, pages: c.pages.filter((_, i) => i !== pageIndex) }));
              setSelected(0);
            }}
          >
            Remove page
          </Button>
        ) : null}
      </div>

      <h3 className="text-sm font-semibold">Sections</h3>
      <ol className="space-y-2">
        {page.sections.map((section, i) => (
          <SectionItem
            key={section.id}
            storeId={storeId}
            section={section}
            first={i === 0}
            last={i === page.sections.length - 1}
            onChange={(s) =>
              setPage((pg) => ({ ...pg, sections: pg.sections.map((x, j) => (j === i ? s : x)) }))
            }
            onMove={(dir) =>
              setPage((pg) => {
                const sections = [...pg.sections];
                const [moved] = sections.splice(i, 1);
                sections.splice(i + dir, 0, moved as Section);
                return { ...pg, sections };
              })
            }
          />
        ))}
      </ol>

      {canAdd && (!has('about') || !has('contact') || !has('custom')) ? (
        <div className="space-y-2 border-t border-neutral-200 pt-4">
          <h3 className="text-sm font-semibold">Add a page</h3>
          <div className="flex flex-wrap gap-2">
            {!has('about') ? (
              <Button variant="secondary" onClick={() => addPage('about')}>
                About us
              </Button>
            ) : null}
            {!has('contact') ? (
              <Button variant="secondary" onClick={() => addPage('contact')}>
                Contact
              </Button>
            ) : null}
          </div>
          {!has('custom') ? (
            <div className="flex gap-2">
              <Input
                aria-label="New page title"
                placeholder="e.g. Shipping policy"
                value={customTitle}
                maxLength={60}
                onChange={(e) => setCustomTitle(e.target.value)}
              />
              <Button variant="secondary" onClick={() => addPage('custom')}>
                Add
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SectionItem({
  storeId,
  section,
  first,
  last,
  onChange,
  onMove,
}: {
  storeId: string;
  section: Section;
  first: boolean;
  last: boolean;
  onChange: (s: Section) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const props = section.props as Record<string, unknown>;
  const setProp = (key: string, value: unknown) =>
    onChange({ ...section, props: { ...props, [key]: value } } as Section);
  const text = (key: string, label: string, max: number, multiline = false) =>
    key in props ? (
      <Field key={key} label={label}>
        {(p) =>
          multiline ? (
            <Textarea
              {...p}
              value={String(props[key] ?? '')}
              maxLength={max}
              onChange={(e) => setProp(key, e.target.value)}
            />
          ) : (
            <Input
              {...p}
              value={String(props[key] ?? '')}
              maxLength={max}
              onChange={(e) => setProp(key, e.target.value)}
            />
          )
        }
      </Field>
    ) : null;

  return (
    <li className="rounded-lg border border-neutral-200">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex-1 truncate rounded px-1 text-start text-sm font-medium"
        >
          {SECTION_LABELS[section.type]}
          {typeof props.title === 'string' && props.title ? (
            <span className="font-normal text-neutral-500"> · {props.title}</span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label="Move up"
          disabled={first}
          onClick={() => onMove(-1)}
          className="rounded px-1.5 py-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={last}
          onClick={() => onMove(1)}
          className="rounded px-1.5 py-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
        >
          ↓
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={section.visible}
          aria-label={section.visible ? 'Visible, click to hide' : 'Hidden, click to show'}
          onClick={() => onChange({ ...section, visible: !section.visible })}
          className={`rounded px-2 py-1 text-xs font-medium ${section.visible ? 'bg-green-50 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}
        >
          {section.visible ? 'Shown' : 'Hidden'}
        </button>
      </div>
      {open ? (
        <div className="space-y-4 border-t border-neutral-200 p-3">
          {text('title', 'Title', 120)}
          {text('subtitle', 'Subtitle', 240, true)}
          {text('body', 'Text', 2000, true)}
          {Array.isArray(props.paragraphs) ? (
            <Field label="Text" hint="Leave an empty line between paragraphs.">
              {(p) => (
                <Textarea
                  {...p}
                  rows={6}
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
            </Field>
          ) : null}
          {'imageUrl' in props ? (
            <ImageUpload
              storeId={storeId}
              purpose="image"
              label="Image"
              value={String(props.imageUrl ?? '')}
              onChange={(url) => setProp('imageUrl', url)}
            />
          ) : null}
          {text('ctaLabel', 'Button label', 40)}
          {text('ctaLink', 'Button link', 2048)}
          {section.type === 'productGrid' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Show">
                {(p) => (
                  <Select
                    {...p}
                    value={section.props.source}
                    onChange={(e) => setProp('source', e.target.value)}
                  >
                    <option value="featured">Featured products</option>
                    <option value="latest">Newest products</option>
                    <option value="all">All products</option>
                  </Select>
                )}
              </Field>
              <Field label="How many">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={24}
                    value={section.props.limit}
                    onChange={(e) =>
                      setProp('limit', Math.max(1, Math.min(24, Number(e.target.value) || 1)))
                    }
                  />
                )}
              </Field>
            </div>
          ) : null}
          {section.type === 'imageText' ? (
            <Field label="Image side">
              {(p) => (
                <Select
                  {...p}
                  value={section.props.imagePosition}
                  onChange={(e) => setProp('imagePosition', e.target.value)}
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </Select>
              )}
            </Field>
          ) : null}
          {section.type === 'banner' ? (
            <Field label="Color">
              {(p) => (
                <Select
                  {...p}
                  value={section.props.tone}
                  onChange={(e) => setProp('tone', e.target.value)}
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                  <option value="neutral">Neutral</option>
                </Select>
              )}
            </Field>
          ) : null}
          {section.type === 'contactInfo' ? (
            <>
              <Toggle
                label="Show WhatsApp"
                checked={section.props.showWhatsapp}
                onChange={(v) => setProp('showWhatsapp', v)}
              />
              <Toggle
                label="Show social links"
                checked={section.props.showSocial}
                onChange={(v) => setProp('showSocial', v)}
              />
            </>
          ) : null}
          {section.type === 'faq' ? (
            <ItemsEditor
              items={section.props.items}
              fields={[
                ['question', 'Question', false],
                ['answer', 'Answer', true],
              ]}
              empty={{ question: 'New question', answer: 'Answer' }}
              onChange={(items) => setProp('items', items)}
              max={20}
            />
          ) : null}
          {section.type === 'testimonials' ? (
            <ItemsEditor
              items={section.props.items}
              fields={[
                ['quote', 'Quote', true],
                ['author', 'Name', false],
                ['role', 'Role', false],
              ]}
              empty={{ quote: 'What your customer said', author: 'Customer', role: '' }}
              onChange={(items) => setProp('items', items)}
              max={12}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ItemsEditor<T extends Record<string, string>>({
  items,
  fields,
  empty,
  onChange,
  max,
}: {
  items: T[];
  fields: [keyof T & string, string, boolean][];
  empty: T;
  onChange: (items: T[]) => void;
  max: number;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-md bg-neutral-50 p-2">
          {fields.map(([key, label, multiline]) => (
            <Field key={key} label={`${label} ${i + 1}`}>
              {(p) =>
                multiline ? (
                  <Textarea
                    {...p}
                    value={item[key]}
                    onChange={(e) =>
                      onChange(items.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)))
                    }
                  />
                ) : (
                  <Input
                    {...p}
                    value={item[key]}
                    onChange={(e) =>
                      onChange(items.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)))
                    }
                  />
                )
              }
            </Field>
          ))}
          <Button variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      {items.length < max ? (
        <Button variant="secondary" onClick={() => onChange([...items, { ...empty }])}>
          Add item
        </Button>
      ) : null}
    </div>
  );
}

function HistoryPanel({
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

  if (!versions) return <p className="text-sm text-neutral-500">Loading…</p>;
  const SOURCE: Record<string, string> = {
    generate: 'Created',
    manual: 'Edited',
    publish: 'Published',
    restore: 'Restored',
    command: 'Command',
  };
  return (
    <ol className="space-y-2">
      {versions.map((v) => (
        <li
          key={v.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-2 text-sm"
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
