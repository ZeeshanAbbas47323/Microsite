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
import { ANNOUNCEMENT_ID, FOOTER_ID, HEADER_ID } from '@microstore/layouts/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Badge, Button, Input, Notice } from '@/components/ui';
import { api, ApiError } from '../api';
import { CommandBox } from '../CommandBox';
import { useT } from '../i18n';
import { useDashboard } from '../session';
import { useStoreActions } from '../useStoreActions';
import {
  AnnouncementSettings,
  FooterSettings,
  HeaderSettings,
  HistoryPanel,
  PageSettings,
  ThemeSettings,
} from './panels';
import { PreviewFrame, type Device } from './PreviewFrame';
import { SectionSettings, sectionTitle } from './SectionSettings';
import { reorder, SectionTree, type Selection } from './SectionTree';
import { ShareKit } from '../ShareKit';
import { MagicBuilder } from './MagicBuilder';
import { Icon, PATHS, SECTION_PATHS } from './icons';

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
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-35 ${pressed ? 'bg-neutral-200/70 text-neutral-900' : ''}`}
    >
      {children}
    </button>
  );
}

const ICONS = {
  desktop: <Icon d={PATHS.desktop} />,
  tablet: <Icon d={PATHS.tablet} />,
  mobile: <Icon d={PATHS.mobile} />,
  undo: <Icon d={PATHS.undo} />,
  redo: <Icon d={PATHS.redo} />,
  back: <Icon d={PATHS.back} />,
  close: <Icon d={PATHS.close} />,
};

interface MenuItem {
  label: string;
  /** Only listed on phones, where the top bar has no room for its own button. */
  phoneOnly?: boolean;
  hint: string;
  icon: string;
  onSelect: () => void;
}

/** The "⋯" menu for the less frequent tools, so the top bar stays calm. */
function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function onMenuKey(e: ReactKeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = all[(at + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
    next?.focus();
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 ${open ? 'bg-neutral-100 text-neutral-900' : ''}`}
      >
        <Icon d={PATHS.more} className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className="absolute end-0 top-11 z-50 w-64 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`w-full items-start gap-3 rounded-lg px-2.5 py-2 text-start hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none ${item.phoneOnly ? 'flex sm:hidden' : 'flex'}`}
            >
              <span className="mt-0.5 text-neutral-500">
                <Icon d={item.icon} className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-neutral-900">{item.label}</span>
                <span className="block text-xs text-neutral-500">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
  const [magicOpen, setMagicOpen] = useState(() => params.get('magic') === '1');
  const [shareOpen, setShareOpen] = useState(() => params.get('share') === '1');
  const [revealSignal, setRevealSignal] = useState(0);
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

  let drill: { title: string; body: ReactNode; actions?: ReactNode; footer?: ReactNode } | null =
    null;
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
      actions: (
        <>
          <IconButton
            label={selectedSection.visible ? 'Hide section' : 'Show section'}
            onClick={() =>
              setPage((p) => ({
                ...p,
                sections: p.sections.map((x, i) =>
                  i === sectionIndex ? { ...x, visible: !x.visible } : x,
                ),
              }))
            }
          >
            <Icon d={selectedSection.visible ? PATHS.eye : PATHS.eyeOff} />
          </IconButton>
          <IconButton
            label="Move up"
            disabled={sectionIndex === 0}
            onClick={() =>
              setPage((p) => ({
                ...p,
                sections: reorder(p.sections, sectionIndex, sectionIndex - 1),
              }))
            }
          >
            <Icon d={PATHS.up} />
          </IconButton>
          <IconButton
            label="Move down"
            disabled={sectionIndex === page.sections.length - 1}
            onClick={() =>
              setPage((p) => ({
                ...p,
                sections: reorder(p.sections, sectionIndex, sectionIndex + 1),
              }))
            }
          >
            <Icon d={PATHS.down} />
          </IconButton>
          <IconButton label="Duplicate" onClick={() => duplicateSection(sectionIndex)}>
            <Icon d={PATHS.copy} />
          </IconButton>
        </>
      ),
      footer: (
        <button
          type="button"
          onClick={() => {
            if (!confirm(`Remove the “${sectionTitle(selectedSection)}” section?`)) return;
            setPage((p) => ({ ...p, sections: p.sections.filter((_, i) => i !== sectionIndex) }));
            setSelection(null);
          }}
          className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Icon d={PATHS.trash} className="h-4 w-4" />
          Remove section
        </button>
      ),
    };
  } else if (selection?.kind === 'announcement') {
    drill = {
      title: 'Announcement bar',
      body: <AnnouncementSettings config={config} update={update} />,
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

  const sidebarTitle = drill
    ? drill.title
    : tab === 'theme'
      ? t('Theme settings')
      : addingPage
        ? t('Add a page')
        : page.title;

  return (
    <div className="flex h-dvh flex-col bg-[#f1f1f1] text-neutral-900">
      {/* Top bar: tools on the left, what you are editing in the middle, actions on the right */}
      <header className="grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-neutral-200 bg-white px-2 sm:px-3 lg:grid-cols-[328px_1fr_auto]">
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            aria-label={t('Exit')}
            title={t('Exit')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Icon d={PATHS.exit} />
          </Link>
          <span className="mx-1 h-6 w-px bg-neutral-200" aria-hidden="true" />
          <div role="tablist" aria-label={t('Editor')} className="flex items-center gap-1">
            {(
              [
                ['sections', 'Sections', PATHS.sections],
                ['theme', 'Theme settings', PATHS.theme],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`editor-tab-${id}`}
                aria-selected={tab === id && !drill}
                aria-controls="editor-panel"
                aria-label={t(label)}
                title={t(label)}
                onClick={() => {
                  setTab(id);
                  setSelection(null);
                  setAddingPage(false);
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${tab === id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}
              >
                <Icon d={icon} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-1 overflow-hidden sm:gap-3">
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <span className="text-neutral-500">
              <Icon d={PATHS.store} className="h-4 w-4" />
            </span>
            <h1 className="truncate text-sm font-medium">{store.name}</h1>
            {status}
          </div>
          <span className="hidden h-5 w-px bg-neutral-200 md:block" aria-hidden="true" />
          <div className="relative flex min-w-0 items-center">
            <span className="pointer-events-none absolute start-2.5 hidden text-neutral-500 sm:block">
              <Icon d={PATHS.page} className="h-4 w-4" />
            </span>
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
                setAddingPage(false);
                setSelection(null);
              }}
              className="h-9 w-28 max-w-48 cursor-pointer truncate rounded-lg sm:w-auto border-0 bg-transparent ps-2 pe-7 sm:ps-8 text-sm font-medium hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {config.pages.map((p, i) => (
                <option key={p.slug} value={i}>
                  {p.title}
                </option>
              ))}
              {canAddPage ? <option value="add">+ {t('Add page')}</option> : null}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div
            className="hidden items-center gap-0.5 xl:flex"
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
            <span className="mx-1 h-6 w-px bg-neutral-200" aria-hidden="true" />
          </div>
          <div className="hidden items-center gap-0.5 sm:flex">
            <IconButton label={t('Undo')} onClick={undo} disabled={!past.current.length}>
              {ICONS.undo}
            </IconButton>
            <IconButton label={t('Redo')} onClick={redo} disabled={!future.current.length}>
              {ICONS.redo}
            </IconButton>
          </div>
          <span className="hidden sm:contents">
            <button
              type="button"
              onClick={() => setMagicOpen(true)}
              title="Magic Store: rebuild the whole store with AI"
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Icon d={PATHS.sparkle} />
              <span className="hidden xl:inline">Magic Store</span>
              <span className="sr-only xl:hidden">Magic Store</span>
            </button>
            <IconButton
              label={t('AI assistant')}
              pressed={drawer === 'ai'}
              onClick={() => setDrawer(drawer === 'ai' ? null : 'ai')}
            >
              <Icon d={PATHS.assistant} />
            </IconButton>
          </span>
          <MoreMenu
            label={t('More actions')}
            items={[
              {
                label: 'Magic Store',
                hint: t('Rebuild the whole store with AI'),
                icon: PATHS.sparkle,
                phoneOnly: true,
                onSelect: () => setMagicOpen(true),
              },
              {
                label: t('AI assistant'),
                hint: t('Describe a change in your words'),
                icon: PATHS.assistant,
                phoneOnly: true,
                onSelect: () => setDrawer('ai'),
              },
              {
                label: t('Share'),
                hint: t('Links, QR code and posts'),
                icon: PATHS.share,
                onSelect: () => setShareOpen(true),
              },
              {
                label: t('Version history'),
                hint: t('Restore an earlier version'),
                icon: PATHS.history,
                onSelect: () => setDrawer('history'),
              },
            ]}
          />
          <span className="mx-1 hidden h-6 w-px bg-neutral-200 sm:block" aria-hidden="true" />
          <span className="hidden sm:contents">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void save()}
              loading={saving}
              disabled={!dirty}
            >
              {t('Save')}
            </Button>
          </span>
          <Button
            onClick={saveAndPublish}
            loading={publishing === 'publish'}
            disabled={
              store.status === 'suspended' ||
              (!dirty && !store.hasUnpublishedChanges && store.status === 'published')
            }
            size="sm"
          >
            {t('Publish')}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
        {/* Sidebar */}
        <aside
          aria-label={t('Editor')}
          className="flex max-h-[48vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:max-h-none lg:w-[320px]"
        >
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-neutral-200 px-2">
            {drill ? (
              <IconButton label={t('Back')} onClick={() => setSelection(null)}>
                {ICONS.back}
              </IconButton>
            ) : null}
            <h2
              className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${drill ? '' : 'ps-2'}`}
            >
              {sidebarTitle}
            </h2>
          </div>

          {welcome && !drill ? (
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
              {selectedSection ? (
                <div className="flex h-10 shrink-0 items-center gap-1 border-b border-neutral-100 ps-4 pe-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-neutral-500">
                    <Icon d={SECTION_PATHS[selectedSection.type]} className="h-3.5 w-3.5" />
                    <span className="truncate">{SECTION_INFO[selectedSection.type].label}</span>
                  </span>
                  {drill.actions}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto">{drill.body}</div>
              {drill.footer ? (
                <div className="border-t border-neutral-200 p-2">{drill.footer}</div>
              ) : null}
            </>
          ) : (
            <div
              role="tabpanel"
              id="editor-panel"
              aria-labelledby={`editor-tab-${tab}`}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {tab === 'theme' ? (
                <ThemeSettings config={config} update={update} />
              ) : addingPage ? (
                <div className="space-y-4 p-4">
                  <p className="text-sm text-neutral-600">
                    {t('Pick a ready-made page or name your own.')}
                  </p>
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
                  <button
                    type="button"
                    onClick={() => setAddingPage(false)}
                    className="text-sm text-neutral-600 underline hover:text-neutral-900"
                  >
                    {t('Cancel')}
                  </button>
                </div>
              ) : (
                <SectionTree
                  page={page}
                  announcement={{
                    enabled: config.announcement.enabled,
                    count: config.announcement.messages.length,
                  }}
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
          )}
        </aside>

        {/* Preview */}
        <main className="relative min-h-[60vh] min-w-0 flex-1 lg:min-h-0">
          <PreviewFrame
            src={previewSrc}
            device={device}
            title={proposalId ? 'Store preview with the suggested change' : 'Store preview'}
            selectedId={
              selection?.kind === 'header'
                ? HEADER_ID
                : selection?.kind === 'announcement'
                  ? ANNOUNCEMENT_ID
                  : selection?.kind === 'footer'
                    ? FOOTER_ID
                    : (selectedSection?.id ?? null)
            }
            hoverId={hoverId}
            onSelect={(id) => {
              setTab('sections');
              setAddingPage(false);
              setSelection(
                id === HEADER_ID
                  ? { kind: 'header' }
                  : id === ANNOUNCEMENT_ID
                    ? { kind: 'announcement' }
                    : id === FOOTER_ID
                      ? { kind: 'footer' }
                      : { kind: 'section', id },
              );
            }}
            onNavigate={onPreviewNavigate}
            revealSignal={revealSignal}
          />

          {drawer ? (
            <div className="absolute inset-y-0 end-0 z-30 flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
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
      {magicOpen ? (
        <MagicBuilder
          storeId={store.id}
          onClose={() => setMagicOpen(false)}
          onBuilt={(next) => {
            // One undo step; nothing is saved until the owner presses Save.
            update(() => next);
            setPageIndex(0);
            setSelection(null);
            setTab('sections');
            setRevealSignal((n) => n + 1);
            setMagicOpen(false);
            setToast({
              tone: 'success',
              text: 'Your new store is ready. Look around, tweak anything, then Save. Undo brings back the old design.',
            });
          }}
        />
      ) : null}
      {shareOpen ? (
        <ShareKit
          onClose={() => setShareOpen(false)}
          info={{
            name: config.business.name,
            tagline: config.business.tagline,
            url: store.url,
            live: store.status === 'published',
            city: config.business.contact.city,
            category: config.business.category,
            colors: {
              primary: config.theme.primaryColor,
              secondary: config.theme.secondaryColor,
              background: config.theme.backgroundColor,
            },
          }}
        />
      ) : null}
    </div>
  );
}
