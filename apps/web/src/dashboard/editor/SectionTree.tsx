'use client';

import {
  MAX_SECTIONS_PER_PAGE,
  SECTION_INFO,
  SECTION_TYPES,
  type Page,
  type Section,
  type SectionType,
} from '@microstore/site-schema';
import { useState, type KeyboardEvent } from 'react';
import { sectionTitle } from './SectionSettings';

/** Tiny glyphs so each section type is recognisable at a glance. */
const GLYPH: Record<SectionType, string> = {
  hero: '▣',
  features: '✦',
  categoryGrid: '▦',
  productGrid: '▤',
  imageText: '◧',
  richText: '¶',
  banner: '▬',
  testimonials: '❝',
  faq: '?',
  contactInfo: '☎',
};

export type Selection =
  | { kind: 'section'; id: string }
  | { kind: 'header' }
  | { kind: 'footer' }
  | { kind: 'page' }
  | null;

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" />
      )}
    </svg>
  );
}

function FixedRow({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm hover:bg-neutral-100"
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-500"
        aria-hidden="true"
      >
        ≡
      </span>
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
      <span className="text-neutral-400" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function SectionTree({
  page,
  selectedId,
  onSelect,
  onHover,
  onReorder,
  onToggle,
  onAdd,
}: {
  page: Page;
  selectedId: string | null;
  onSelect: (selection: Selection) => void;
  onHover: (id: string | null) => void;
  onReorder: (from: number, to: number) => void;
  onToggle: (index: number) => void;
  onAdd: (type: SectionType, at: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const full = page.sections.length >= MAX_SECTIONS_PER_PAGE;

  function onRowKey(e: KeyboardEvent, i: number) {
    // Alt+Arrow moves the section; plain arrows move focus between rows.
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (to >= 0 && to < page.sections.length) onReorder(i, to);
    }
  }

  if (picker) {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add a section</h3>
          <button
            type="button"
            onClick={() => setPicker(false)}
            className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
        <ul className="grid gap-2">
          {SECTION_TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                onClick={() => {
                  onAdd(type, page.sections.length);
                  setPicker(false);
                }}
                className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 p-3 text-start hover:border-indigo-400 hover:bg-indigo-50/40"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700"
                  aria-hidden="true"
                >
                  {GLYPH[type]}
                </span>
                <span>
                  <span className="block text-sm font-medium">{SECTION_INFO[type].label}</span>
                  <span className="block text-xs text-neutral-500">
                    {SECTION_INFO[type].description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      <FixedRow
        label="Header"
        hint="Logo, menu and cart"
        onClick={() => onSelect({ kind: 'header' })}
      />
      <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Sections
      </p>
      <ol
        aria-label="Sections on this page"
        className="space-y-0.5"
        onMouseLeave={() => onHover(null)}
      >
        {page.sections.map((section, i) => (
          <li
            key={section.id}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', section.id);
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              setDropIndex(e.clientY < rect.top + rect.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dropIndex !== null) {
                const to = dropIndex > dragIndex ? dropIndex - 1 : dropIndex;
                if (to !== dragIndex) onReorder(dragIndex, to);
              }
              setDragIndex(null);
              setDropIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDropIndex(null);
            }}
            onMouseEnter={() => onHover(section.id)}
            className={`group relative ${dragIndex === i ? 'opacity-40' : ''}`}
          >
            {dropIndex === i && dragIndex !== null ? (
              <span
                className="absolute inset-x-2 -top-px h-0.5 rounded bg-indigo-600"
                aria-hidden="true"
              />
            ) : null}
            {dropIndex === i + 1 && dragIndex !== null && i === page.sections.length - 1 ? (
              <span
                className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-indigo-600"
                aria-hidden="true"
              />
            ) : null}
            <div
              className={`flex items-center gap-1 rounded-lg pe-1 ${selectedId === section.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-neutral-100'}`}
            >
              <span
                className="cursor-grab px-1.5 text-neutral-300 group-hover:text-neutral-500 active:cursor-grabbing"
                aria-hidden="true"
                title="Drag to reorder"
              >
                ⋮⋮
              </span>
              <button
                type="button"
                onClick={() => onSelect({ kind: 'section', id: section.id })}
                onKeyDown={(e) => onRowKey(e, i)}
                onFocus={() => onHover(section.id)}
                aria-current={selectedId === section.id ? 'true' : undefined}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 text-start text-sm ${section.visible ? '' : 'text-neutral-400'}`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-600"
                  aria-hidden="true"
                >
                  {GLYPH[section.type]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{sectionTitle(section)}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {SECTION_INFO[section.type].label}
                    {section.visible ? '' : ' · hidden'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggle(i)}
                aria-label={
                  section.visible
                    ? `Hide ${sectionTitle(section)}`
                    : `Show ${sectionTitle(section)}`
                }
                aria-pressed={!section.visible}
                className="rounded-md p-1.5 text-neutral-400 opacity-0 hover:bg-white hover:text-neutral-700 focus:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100"
              >
                <EyeIcon open={section.visible} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={full}
        onClick={() => setPicker(true)}
        className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:text-neutral-400"
      >
        <span className="text-lg leading-none" aria-hidden="true">
          +
        </span>
        {full ? `This page has the maximum of ${MAX_SECTIONS_PER_PAGE} sections` : 'Add section'}
      </button>
      <div className="pt-3">
        <FixedRow
          label="Footer"
          hint="Links, contact and footer text"
          onClick={() => onSelect({ kind: 'footer' })}
        />
        <FixedRow
          label="Page settings"
          hint="Name in the menu, search engines"
          onClick={() => onSelect({ kind: 'page' })}
        />
      </div>
    </div>
  );
}

export function reorder(sections: Section[], from: number, to: number): Section[] {
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as Section);
  return next;
}
