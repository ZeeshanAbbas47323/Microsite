'use client';

import type { SiteConfig } from '@microstore/site-schema';
import { useEffect, useRef, useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { api, ApiError, uploadImage } from '../api';
import { extractPalette } from './palette';

interface MagicResult {
  config: SiteConfig;
  summary: { layout: string; tagline: string; font: string; colors: string[]; sections: number };
  remaining: number;
}

const EXAMPLES = [
  'Main Lahore mein handmade leather bags aur wallets bechta hoon',
  'Karachi se ghar ke bane cakes aur mithai',
  'Women’s lawn suits and kurtas, delivered across Pakistan',
  'Mobile chargers, earbuds and phone covers at fair prices',
];

const STEPS = [
  'Reading your description',
  'Choosing brand colors',
  'Picking a layout and fonts',
  'Writing your home page',
  'Writing About, FAQ and Google text',
  'Putting your store together',
];

/** "Magic store": one sentence (+ logo) → a complete design, previewed as unsaved changes. */
export function MagicBuilder({
  storeId,
  onBuilt,
  onClose,
}: {
  storeId: string;
  onBuilt: (config: SiteConfig, result: MagicResult) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<'en' | 'ur'>('en');
  const [logo, setLogo] = useState<{ preview: string; url: string; colors: string[] } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [phase, setPhase] = useState<'form' | 'building' | 'done'>('form');
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MagicResult | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'building') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialog.current?.querySelector<HTMLElement>('textarea')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  // Steps advance while the AI works; the last one waits for the answer.
  useEffect(() => {
    if (phase !== 'building') return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1300);
    return () => clearInterval(timer);
  }, [phase]);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    setError(null);
    try {
      const colors = await extractPalette(file).catch(() => []);
      const preview = URL.createObjectURL(file);
      // The logo is also used in the navbar; without object storage the colors still help.
      const url = await uploadImage(storeId, file, 'logo')
        .then((a) => a.url)
        .catch(() => '');
      setLogo({ preview, url, colors });
    } finally {
      setLogoBusy(false);
    }
  }

  async function build() {
    setPhase('building');
    setStep(0);
    setError(null);
    try {
      const res = await api<MagicResult>(`/stores/${storeId}/magic-build`, {
        method: 'POST',
        body: {
          description: description.trim(),
          brandColors: logo?.colors ?? [],
          logoUrl: logo?.url ?? '',
          language,
        },
      });
      setStep(STEPS.length);
      setResult(res);
      setPhase('done');
    } catch (e) {
      setPhase('form');
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-sm">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="magic-title"
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="relative overflow-hidden rounded-t-2xl bg-[linear-gradient(120deg,#4f46e5,#7c3aed_45%,#db2777)] px-6 py-5 text-white">
          <h2 id="magic-title" className="text-xl font-bold">
            ✨ Magic Store
          </h2>
          <p className="text-sm text-white/90">
            Tell us what you sell. AI designs your whole store: layout, colors, text, FAQ and SEO.
          </p>
          {phase !== 'building' ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute end-3 top-3 rounded-lg p-1.5 text-white/90 hover:bg-white/15"
            >
              ✕
            </button>
          ) : null}
        </div>

        {phase === 'form' ? (
          <form
            className="space-y-5 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (description.trim().length >= 10) void build();
            }}
          >
            <div className="space-y-2">
              <label htmlFor="magic-description" className="block text-sm font-semibold">
                Describe your business in one sentence
              </label>
              <textarea
                id="magic-description"
                rows={3}
                maxLength={400}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Main Lahore mein handmade leather bags bechta hoon"
                className="w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <div className="flex flex-wrap gap-1.5" aria-label="Examples">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setDescription(ex)}
                    className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 hover:bg-indigo-50 hover:text-indigo-800"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">
                Your logo <span className="font-normal text-neutral-500">(optional)</span>
              </p>
              <div className="flex items-center gap-4">
                <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 text-xs text-neutral-500 hover:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-300">
                  {logo ? (
                    <img
                      src={logo.preview}
                      alt="Your logo"
                      className="h-full w-full object-contain"
                    />
                  ) : logoBusy ? (
                    'Reading…'
                  ) : (
                    'Upload'
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => void onLogo(e.target.files?.[0])}
                  />
                </label>
                <div className="text-sm text-neutral-600">
                  {logo?.colors.length ? (
                    <>
                      <p className="mb-1.5">Brand colors from your logo:</p>
                      <div className="flex gap-2">
                        {logo.colors.map((c) => (
                          <span
                            key={c}
                            title={c}
                            className="h-8 w-8 rounded-full ring-2 ring-white shadow"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>We read its colors and build your theme around them.</p>
                  )}
                </div>
              </div>
            </div>

            <fieldset className="flex items-center gap-3 text-sm">
              <legend className="sr-only">Language</legend>
              <span className="font-semibold">Store text in</span>
              {(
                [
                  ['en', 'English'],
                  ['ur', 'اردو'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="magic-language"
                    checked={language === value}
                    onChange={() => setLanguage(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">
                Nothing goes live until you Save and Publish. You can undo.
              </p>
              <Button type="submit" disabled={description.trim().length < 10 || logoBusy}>
                ✨ Build my store
              </Button>
            </div>
          </form>
        ) : null}

        {phase !== 'form' ? (
          <div className="space-y-5 p-6" aria-live="polite">
            <ol className="space-y-2.5">
              {STEPS.map((label, i) => {
                const done = i < step;
                const active = i === step && phase === 'building';
                return (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-400'}`}
                      aria-hidden="true"
                    >
                      {done ? '✓' : active ? <span className="animate-pulse">•</span> : i + 1}
                    </span>
                    <span
                      className={
                        done ? 'text-neutral-900' : active ? 'font-medium' : 'text-neutral-400'
                      }
                    >
                      {label}
                      {i === 1 && logo?.colors.length ? ' from your logo' : ''}
                    </span>
                  </li>
                );
              })}
            </ol>

            {phase === 'done' && result ? (
              <div className="space-y-4 rounded-xl bg-neutral-50 p-4">
                <p className="text-base font-semibold">“{result.summary.tagline}”</p>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-neutral-500">Layout</dt>
                    <dd className="font-medium">{result.summary.layout}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Font</dt>
                    <dd className="font-medium">{result.summary.font}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Colors</dt>
                    <dd className="flex gap-1.5 pt-0.5">
                      {result.summary.colors.map((c) => (
                        <span
                          key={c}
                          title={c}
                          className="h-5 w-5 rounded-full ring-1 ring-neutral-300"
                          style={{ background: c }}
                        />
                      ))}
                    </dd>
                  </div>
                </dl>
                <Button
                  className="w-full"
                  onClick={() => {
                    onBuilt(result.config, result);
                  }}
                >
                  See my new store →
                </Button>
                <p className="text-center text-xs text-neutral-500">
                  {result.remaining} magic builds left today
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
