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
import { Icon, PATHS, SECTION_PATHS } from './icons';
import { sectionTitle } from './SectionSettings';

export type Selection =
  | { kind: 'section'; id: string }
  | { kind: 'announcement' }
  | { kind: 'header' }
  | { kind: 'footer' }
  | { kind: 'page' }
  | null;

function GroupLabel({ children }: { children: string }) {
  return <h3 className="px-3 pb-1 pt-4 text-[13px] font-semibold text-neutral-900">{children}</h3>;
}

/** A fixed part of every page (header, footer, page settings): one quiet row with a chevron. */
function FixedRow({
  label,
  hint,
  icon,
  muted = false,
  onClick,
}: {
  label: string;
  hint: string;
  icon: string;
  /** Greyed out, e.g. a bar that is switched off. */
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`group flex h-9 w-full items-center gap-2.5 rounded-lg ps-3 pe-2 text-start text-sm hover:bg-neutral-100 ${muted ? 'text-neutral-500' : 'text-neutral-800'}`}
    >
      <span className="text-neutral-500">
        <Icon d={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {label}
        <span className="sr-only">, {hint}</span>
      </span>
      <span className="text-neutral-400 opacity-0 group-hover:opacity-100">
        <Icon d={PATHS.chevron} className="h-4 w-4" />
      </span>
    </button>
  );
}

function AddRow({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2.5 rounded-lg ps-3 pe-2 text-start text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:text-neutral-400 disabled:hover:bg-transparent"
    >
      <Icon d={PATHS.plusCircle} className="h-4 w-4" />
      {label}
    </button>
  );
}

export function SectionTree({
  page,
  announcement,
  selectedId,
  onSelect,
  onHover,
  onReorder,
  onToggle,
  onAdd,
}: {
  page: Page;
  /** Shown as the first row of the header group. */
  announcement: { enabled: boolean; count: number };
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
      <div className="p-2">
        <div className="flex items-center justify-between px-3 pb-2 pt-2">
          <h3 className="text-[13px] font-semibold text-neutral-900">Add section</h3>
          <button
            type="button"
            onClick={() => setPicker(false)}
            className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
        <ul className="space-y-0.5">
          {SECTION_TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                onClick={() => {
                  onAdd(type, page.sections.length);
                  setPicker(false);
                }}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start hover:bg-neutral-100"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600">
                  <Icon d={SECTION_PATHS[type]} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900">
                    {SECTION_INFO[type].label}
                  </span>
                  <span className="block text-xs leading-snug text-neutral-500">
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
    <div className="px-2 pb-4">
      <section aria-label="Header group">
        <GroupLabel>Header</GroupLabel>
        <FixedRow
          label="Announcement bar"
          hint={
            announcement.enabled
              ? `${announcement.count} message${announcement.count === 1 ? '' : 's'}`
              : 'Off'
          }
          icon={PATHS.megaphone}
          muted={!announcement.enabled}
          onClick={() => onSelect({ kind: 'announcement' })}
        />
        <FixedRow
          label="Header"
          hint="Logo, menu and cart"
          icon={PATHS.header}
          onClick={() => onSelect({ kind: 'header' })}
        />
      </section>

      <section aria-label="Page sections" className="mt-2 border-t border-neutral-100">
        <GroupLabel>Template</GroupLabel>
        <ol aria-label="Sections on this page" onMouseLeave={() => onHover(null)}>
          {page.sections.map((section, i) => {
            const title = sectionTitle(section);
            const selected = selectedId === section.id;
            return (
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
                    className="absolute inset-x-2 -top-px z-10 h-0.5 rounded bg-brand-600"
                    aria-hidden="true"
                  />
                ) : null}
                {dropIndex === i + 1 && dragIndex !== null && i === page.sections.length - 1 ? (
                  <span
                    className="absolute inset-x-2 -bottom-px z-10 h-0.5 rounded bg-brand-600"
                    aria-hidden="true"
                  />
                ) : null}
                <div
                  className={`flex h-9 items-center rounded-lg pe-1 ${selected ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
                >
                  <span
                    className="flex w-3 cursor-grab justify-center text-neutral-400 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
                    aria-hidden="true"
                    title="Drag to reorder"
                  >
                    <Icon d={PATHS.grip} className="h-3.5 w-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: 'section', id: section.id })}
                    onKeyDown={(e) => onRowKey(e, i)}
                    onFocus={() => onHover(section.id)}
                    aria-current={selected ? 'true' : undefined}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                    className={`flex h-full min-w-0 flex-1 items-center gap-2.5 text-start text-sm ${section.visible ? 'text-neutral-800' : 'text-neutral-400'}`}
                  >
                    <span className={section.visible ? 'text-neutral-500' : 'text-neutral-300'}>
                      <Icon d={SECTION_PATHS[section.type]} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 truncate" title={title}>
                      {title}
                      <span className="sr-only"> {SECTION_INFO[section.type].label}</span>
                      {section.visible ? null : <span className="sr-only"> (hidden)</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(i)}
                    aria-label={section.visible ? `Hide ${title}` : `Show ${title}`}
                    aria-pressed={!section.visible}
                    title={section.visible ? 'Hide section' : 'Show section'}
                    className="rounded-md p-1.5 text-neutral-500 opacity-0 hover:bg-neutral-200 hover:text-neutral-800 focus:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100"
                  >
                    <Icon d={section.visible ? PATHS.eye : PATHS.eyeOff} className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <AddRow
          label={full ? `Maximum of ${MAX_SECTIONS_PER_PAGE} sections reached` : 'Add section'}
          disabled={full}
          onClick={() => setPicker(true)}
        />
      </section>

      <section aria-label="Footer group" className="mt-2 border-t border-neutral-100">
        <GroupLabel>Footer</GroupLabel>
        <FixedRow
          label="Footer"
          hint="Links, contact and footer text"
          icon={PATHS.footer}
          onClick={() => onSelect({ kind: 'footer' })}
        />
        <FixedRow
          label="Page settings"
          hint="Name in the menu, search engines"
          icon={PATHS.page}
          onClick={() => onSelect({ kind: 'page' })}
        />
      </section>
    </div>
  );
}

export function reorder(sections: Section[], from: number, to: number): Section[] {
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as Section);
  return next;
}
