'use client';

import {
  createOptionalPage,
  createSection,
  MAX_CONTENT_PAGES,
  SECTION_INFO,
  type BusinessCategory,
  type Page,
  type Section,
  type SectionType,
  type SiteConfig,
} from '@microstore/site-schema';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Input, Notice } from '@/components/ui';
import { api, ApiError } from '../api';
import { CommandBox } from '../CommandBox';
import { useT } from '../i18n';
import { useDashboard } from '../session';
import { useStoreActions } from '../useStoreActions';
import {
  FooterSettings,
  HeaderSettings,
  HistoryPanel,
  PageSettings,
  ThemeSettings,
} from './panels';
import { PreviewFrame, type Device } from './PreviewFrame';
import { SectionSettings, sectionTitle } from './SectionSettings';
import { reorder, SectionTree, type Selection } from './SectionTree';

const HISTORY_LIMIT = 60;
/** Edits closer together than this (typing) become one undo step. */
const COALESCE_MS = 700;

function pagePathOf(page: Page) {
  return page.slug === 'home' ? '/' : `/${page.slug}`;
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-35 ${pressed ? 'bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white' : ''}`}
    >
      {children}
    </button>
  );
}

const svg = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);
const ICONS = {
  desktop: svg('M3 4h18v12H3zM8 20h8M12 16v4'),
  tablet: svg('M6 3h12v18H6zM11 18h2'),
  mobile: svg('M8 3h8v18H8zM11 18h2'),
  undo: svg('M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3'),
  redo: svg('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3'),
  back: svg('M15 18l-6-6 6-6'),
  close: svg('M6 6l12 12M18 6 6 18'),
};

/**
 * FR-6.2 theme editor, laid out like a hosted-store theme editor: pages and sections on the left,
 * the live store in the middle, settings for whatever is selected. Edits stay in the browser
 * (with undo/redo) and show in the preview right away; Save writes the draft, Publish makes it live.
 */
export function ThemeEditor() {
  const { store, refreshStore, locale } = useDashboard();
  const t = useT();
  const params = useSearchParams();
  const { publish, busy: publishing, error: publishError } = useStoreActions();
  const storeId = store?.id;

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [saved, setSaved] = useState<string>('');
  const past = useRef<SiteConfig[]>([]);
  const future = useRef<SiteConfig[]>([]);
  const lastEdit = useRef(0);
  const [, setHistoryTick] = useState(0);

  const [pageIndex, setPageIndex] = useState(0);
  const [tab, setTab] = useState<'sections' | 'theme'>('sections');
  const [selection, setSelection] = useState<Selection>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [drawer, setDrawer] = useState<'ai' | 'history' | null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: 'error' | 'success'; text: ReactNode } | null>(null);
  const [welcome, setWelcome] = useState(Boolean(params.get('welcome')));

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [liveDraftId, setLiveDraftId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);

  const dirty = config !== null && JSON.stringify(config) !== saved;
  const page = config?.pages[pageIndex] ?? config?.pages[0] ?? null;

  const load = useCallback(async () => {
    if (!storeId) return;
    const res = await api<{ config: SiteConfig }>(`/stores/${storeId}/config/draft`);
    setConfig(res.config);
    setSaved(JSON.stringify(res.config));
    past.current = [];
    future.current = [];
    setHistoryTick((n) => n + 1);
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
    const timer = setInterval(issue, 45 * 60 * 1000); // tokens live 1 h
    return () => clearInterval(timer);
  }, [storeId]);

  // Unsaved edits reach the preview through the API's short-lived live-preview store.
  useEffect(() => {
    if (!storeId || !config || !dirty) {
      setLiveDraftId(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ draftId: string }>(`/stores/${storeId}/config/live-preview`, {
        method: 'POST',
        body: { config },
      })
        .then((r) => {
          if (!cancelled) setLiveDraftId(r.draftId);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [storeId, config, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const previewSrc = useMemo(() => {
    if (!previewUrl || !page) return null;
    const url = new URL(previewUrl);
    url.pathname = pagePathOf(page);
    if (dirty && liveDraftId) url.searchParams.set('draft', liveDraftId);
    else if (proposalId) url.searchParams.set('command', proposalId);
    return url.toString();
  }, [previewUrl, page, dirty, liveDraftId, proposalId]);

  // -- Editing ------------------------------------------------------------------------------

  // The latest config for event handlers; history lives in refs so updates stay side-effect free.
  const configRef = useRef<SiteConfig | null>(null);
  configRef.current = config;

  const commit = useCallback((next: SiteConfig) => {
    configRef.current = next;
    setConfig(next);
    setHistoryTick((n) => n + 1);
  }, []);

  const update = useCallback(
    (fn: (c: SiteConfig) => SiteConfig) => {
      const current = configRef.current;
      if (!current) return;
      const now = Date.now();
      if (now - lastEdit.current > COALESCE_MS) {
        past.current = [...past.current.slice(-HISTORY_LIMIT + 1), current];
        future.current = [];
      }
      lastEdit.current = now;
      commit(fn(structuredClone(current)));
      setToast(null);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const current = configRef.current;
    const previous = past.current.at(-1);
    if (!current || !previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [current, ...future.current];
    lastEdit.current = 0;
    commit(previous);
  }, [commit]);

  const redo = useCallback(() => {
    const current = configRef.current;
    const next = future.current[0];
    if (!current || !next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, current];
    lastEdit.current = 0;
    commit(next);
  }, [commit]);

  const setPage = useCallback(
    (fn: (p: Page) => Page) =>
      update((c) => ({
        ...c,
        pages: c.pages.map((p, i) => (i === pageIndex ? fn(p) : p)),
      })),
    [update, pageIndex],
  );

  const selectedSection =
    selection?.kind === 'section'
      ? (page?.sections.find((s) => s.id === selection.id) ?? null)
      : null;
  const sectionIndex = selectedSection && page ? page.sections.indexOf(selectedSection) : -1;

  function addSection(type: SectionType, at: number) {
    if (!page) return;
    const section = createSection(
      type,
      page.sections.map((s) => s.id),
    );
    setPage((p) => {
      const sections = [...p.sections];
      sections.splice(at, 0, section);
      return { ...p, sections };
    });
    setSelection({ kind: 'section', id: section.id });
  }

  function duplicateSection(index: number) {
    if (!page) return;
    const original = page.sections[index];
    if (!original) return;
    const copy = {
      ...structuredClone(original),
      id: createSection(
        original.type,
        page.sections.map((s) => s.id),
      ).id,
    } as Section;
    setPage((p) => {
      const sections = [...p.sections];
      sections.splice(index + 1, 0, copy);
      return { ...p, sections };
    });
    setSelection({ kind: 'section', id: copy.id });
  }

  function addPage(template: 'about' | 'contact' | 'custom') {
    if (!config) return;
    const b = config.business;
    const title = customTitle.trim() || 'Policies';
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'page';
    const newPage = createOptionalPage(
      template,
      {
        name: b.name,
        description: b.description,
        category: b.category as BusinessCategory,
        city: b.contact.city,
        hasWhatsapp: b.contact.whatsapp !== '',
      },
      template === 'custom' ? { title, slug } : undefined,
    );
    update((c) => ({ ...c, pages: [...c.pages, newPage] }));
    setPageIndex(config.pages.length);
    setSelection(null);
    setAddingPage(false);
    setCustomTitle('');
  }

  // -- Save / publish -----------------------------------------------------------------------

  const save = useCallback(async (): Promise<boolean> => {
    if (!storeId || !config) return false;
    setSaving(true);
    try {
      const res = await api<{ config: SiteConfig }>(`/stores/${storeId}/config/draft`, {
        method: 'PUT',
        body: { config },
      });
      setConfig(res.config);
      setSaved(JSON.stringify(res.config));
      await refreshStore();
      setToast({ tone: 'success', text: t('Draft saved. Publish to make it live.') });
      return true;
    } catch (e) {
      const details =
        e instanceof ApiError && Array.isArray(e.details)
          ? (e.details as { path: string; message: string }[])
          : [];
      setToast({
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
  }, [storeId, config, refreshStore, t]);

  async function saveAndPublish() {
    if (dirty && !(await save())) return;
    const s = await publish();
    if (s)
      setToast({ tone: 'success', text: t('Published. Your store is live with these changes.') });
  }

  // Keyboard: undo/redo outside text fields (they keep their own undo), save anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        if (dirty) void save();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save, undo, redo]);

  const onPreviewNavigate = useCallback(
    (path: string) => {
      if (!config) return;
      const index = config.pages.findIndex((p) => pagePathOf(p) === path);
      if (index >= 0 && index !== pageIndex) {
        setPageIndex(index);
        setSelection(null);
      }
    },
    [config, pageIndex],
  );

  if (!store || !config || !page) {
    return <p className="p-8 text-neutral-500">{t('Loading…')}</p>;
  }

  const status = dirty ? (
    <Badge tone="amber">{t('Unsaved changes')}</Badge>
  ) : store.hasUnpublishedChanges ? (
    <Badge tone="indigo">{t('Draft not published')}</Badge>
  ) : (
    <Badge tone="green">{t('Up to date')}</Badge>
  );

  const has = (template: Page['template']) => config.pages.some((p) => p.template === template);
  const canAddPage =
    config.pages.length < MAX_CONTENT_PAGES && (!has('about') || !has('contact') || !has('custom'));

  // -- Sidebar content ----------------------------------------------------------------------

  let drill: { title: string; body: ReactNode; footer?: ReactNode } | null = null;
  if (selectedSection && sectionIndex >= 0) {
    drill = {
      title: sectionTitle(selectedSection),
      body: (
        <SectionSettings
          storeId={store.id}
          section={selectedSection}
          onChange={(s) =>
            setPage((p) => ({
              ...p,
              sections: p.sections.map((x) => (x.id === s.id ? s : x)),
            }))
          }
        />
      ),
      footer: (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={sectionIndex === 0}
            onClick={() =>
              setPage((p) => ({
                ...p,
                sections: reorder(p.sections, sectionIndex, sectionIndex - 1),
              }))
            }
          >
            ↑ Up
          </Button>
          <Button
            variant="secondary"
            disabled={sectionIndex === page.sections.length - 1}
            onClick={() =>
              setPage((p) => ({
                ...p,
                sections: reorder(p.sections, sectionIndex, sectionIndex + 1),
              }))
            }
          >
            ↓ Down
          </Button>
          <Button variant="secondary" onClick={() => duplicateSection(sectionIndex)}>
            Duplicate
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setPage((p) => ({
                ...p,
                sections: p.sections.map((x, i) =>
                  i === sectionIndex ? { ...x, visible: !x.visible } : x,
                ),
              }))
            }
          >
            {selectedSection.visible ? 'Hide' : 'Show'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm(`Remove the “${sectionTitle(selectedSection)}” section?`)) return;
              setPage((p) => ({ ...p, sections: p.sections.filter((_, i) => i !== sectionIndex) }));
              setSelection(null);
            }}
          >
            Remove section
          </Button>
        </div>
      ),
    };
  } else if (selection?.kind === 'header') {
    drill = { title: 'Header', body: <HeaderSettings config={config} update={update} /> };
  } else if (selection?.kind === 'footer') {
    drill = { title: 'Footer', body: <FooterSettings config={config} update={update} /> };
  } else if (selection?.kind === 'page') {
    drill = {
      title: `${page.title} settings`,
      body: (
        <PageSettings
          page={page}
          setPage={setPage}
          onRemove={
            page.template === 'home' || page.template === 'products'
              ? null
              : () => {
                  update((c) => ({ ...c, pages: c.pages.filter((_, i) => i !== pageIndex) }));
                  setPageIndex(0);
                  setSelection(null);
                }
          }
        />
      ),
    };
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 sm:px-3">
        <Link
          href="/dashboard"
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {ICONS.back}
          <span className="hidden sm:inline">{t('Exit')}</span>
        </Link>
        <span className="hidden h-6 w-px bg-neutral-200 sm:block" aria-hidden="true" />
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <h1 className="truncate text-sm font-semibold">{store.name}</h1>
          {status}
        </div>

        <div className="mx-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="editor-page">
            {t('Page')}
          </label>
          <select
            id="editor-page"
            value={pageIndex}
            onChange={(e) => {
              if (e.target.value === 'add') {
                setAddingPage(true);
                setTab('sections');
                setSelection(null);
                return;
              }
              setPageIndex(Number(e.target.value));
              setSelection(null);
            }}
            className="h-9 max-w-44 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium hover:border-neutral-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {config.pages.map((p, i) => (
              <option key={p.slug} value={i}>
                {p.title}
              </option>
            ))}
            {canAddPage ? <option value="add">+ {t('Add page')}</option> : null}
          </select>
          <div
            className="ms-1 hidden items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5 sm:flex"
            role="group"
            aria-label={t('Preview size')}
          >
            {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
              <IconButton
                key={d}
                label={d[0]?.toUpperCase() + d.slice(1)}
                pressed={device === d}
                onClick={() => setDevice(d)}
              >
                {ICONS[d]}
              </IconButton>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <IconButton label={t('Undo')} onClick={undo} disabled={!past.current.length}>
            {ICONS.undo}
          </IconButton>
          <IconButton label={t('Redo')} onClick={redo} disabled={!future.current.length}>
            {ICONS.redo}
          </IconButton>
          <button
            type="button"
            onClick={() => setDrawer(drawer === 'ai' ? null : 'ai')}
            aria-pressed={drawer === 'ai'}
            className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 aria-pressed:bg-indigo-50 sm:flex"
          >
            <span aria-hidden="true">✦</span> {t('AI assistant')}
          </button>
          <button
            type="button"
            onClick={() => setDrawer(drawer === 'history' ? null : 'history')}
            aria-pressed={drawer === 'history'}
            className="hidden h-9 rounded-lg px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 aria-pressed:bg-neutral-100 lg:block"
          >
            {t('History')}
          </button>
          <Button
            variant="secondary"
            onClick={() => void save()}
            loading={saving}
            disabled={!dirty}
          >
            {t('Save')}
          </Button>
          <Button
            onClick={saveAndPublish}
            loading={publishing === 'publish'}
            disabled={
              store.status === 'suspended' ||
              (!dirty && !store.hasUnpublishedChanges && store.status === 'published')
            }
          >
            {t('Publish')}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="flex max-h-[48vh] w-full shrink-0 flex-col border-b border-neutral-200 bg-white lg:max-h-none lg:w-[340px] lg:border-b-0 lg:border-e">
          {welcome ? (
            <div className="border-b border-neutral-200 p-3">
              <Notice tone="success">
                {t(
                  'Your store is ready as a draft. Adjust the design, then press Publish when you are happy.',
                )}
              </Notice>
              <button
                type="button"
                onClick={() => setWelcome(false)}
                className="mt-1 text-xs text-neutral-500 underline"
              >
                {t('Dismiss')}
              </button>
            </div>
          ) : null}

          {drill ? (
            <>
              <div className="flex items-center gap-2 border-b border-neutral-200 px-2 py-2">
                <IconButton label={t('Back')} onClick={() => setSelection(null)}>
                  {ICONS.back}
                </IconButton>
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{drill.title}</h2>
                {selectedSection ? (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {SECTION_INFO[selectedSection.type].label}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{drill.body}</div>
              {drill.footer ? (
                <div className="border-t border-neutral-200 p-3">{drill.footer}</div>
              ) : null}
            </>
          ) : (
            <>
              <div
                role="tablist"
                aria-label={t('Editor')}
                className="flex border-b border-neutral-200 px-2"
              >
                {(
                  [
                    ['sections', 'Sections'],
                    ['theme', 'Theme settings'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    id={`editor-tab-${id}`}
                    aria-selected={tab === id}
                    aria-controls={`editor-panel-${id}`}
                    onClick={() => setTab(id)}
                    className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-neutral-600 hover:text-neutral-900'}`}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`editor-panel-${tab}`}
                aria-labelledby={`editor-tab-${tab}`}
                className="min-h-0 flex-1 overflow-y-auto"
              >
                {tab === 'theme' ? (
                  <ThemeSettings config={config} update={update} />
                ) : addingPage ? (
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{t('Add a page')}</h3>
                      <button
                        type="button"
                        onClick={() => setAddingPage(false)}
                        className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
                      >
                        {t('Cancel')}
                      </button>
                    </div>
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
                          {t('Add')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <SectionTree
                    page={page}
                    selectedId={null}
                    onSelect={setSelection}
                    onHover={setHoverId}
                    onToggle={(i) =>
                      setPage((p) => ({
                        ...p,
                        sections: p.sections.map((x, j) =>
                          j === i ? { ...x, visible: !x.visible } : x,
                        ),
                      }))
                    }
                    onReorder={(from, to) =>
                      setPage((p) => ({ ...p, sections: reorder(p.sections, from, to) }))
                    }
                    onAdd={addSection}
                  />
                )}
              </div>
            </>
          )}
        </aside>

        {/* Preview */}
        <main className="relative min-h-0 min-w-0 flex-1">
          <PreviewFrame
            src={previewSrc}
            device={device}
            title={proposalId ? 'Store preview with the suggested change' : 'Store preview'}
            selectedId={selectedSection?.id ?? null}
            hoverId={hoverId}
            onSelect={(id) => {
              setTab('sections');
              setAddingPage(false);
              setSelection({ kind: 'section', id });
            }}
            onNavigate={onPreviewNavigate}
          />

          {drawer ? (
            <div className="absolute inset-y-0 end-0 z-30 flex w-full max-w-md flex-col border-s border-neutral-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <h2 className="text-sm font-semibold">
                  {drawer === 'ai' ? t('AI assistant') : t('Version history')}
                </h2>
                <IconButton label={t('Close')} onClick={() => setDrawer(null)}>
                  {ICONS.close}
                </IconButton>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {drawer === 'ai' ? (
                  <div className="p-4">
                    <CommandBox
                      storeId={store.id}
                      language={locale}
                      disabledReason={
                        dirty
                          ? t('Save or discard your manual changes first, then ask the assistant.')
                          : null
                      }
                      onProposal={setProposalId}
                      onApplied={async () => {
                        await load();
                        await refreshStore();
                      }}
                      onUndone={async () => {
                        await load();
                        await refreshStore();
                        setToast({ tone: 'success', text: t('Change undone.') });
                      }}
                    />
                  </div>
                ) : (
                  <HistoryPanel
                    storeId={store.id}
                    dirty={dirty}
                    onRestored={async () => {
                      await load();
                      await refreshStore();
                      setToast({ tone: 'success', text: t('Version restored into your draft.') });
                    }}
                  />
                )}
              </div>
            </div>
          ) : null}

          {toast || publishError ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl bg-white p-1 shadow-xl ring-1 ring-neutral-200">
                <div className="flex-1">
                  <Notice tone={publishError ? 'error' : (toast?.tone ?? 'success')}>
                    {publishError ?? toast?.text}
                  </Notice>
                </div>
                <IconButton label={t('Close')} onClick={() => setToast(null)}>
                  {ICONS.close}
                </IconButton>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
