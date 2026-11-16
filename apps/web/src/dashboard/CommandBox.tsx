'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Notice, Spinner } from '@/components/ui';
import { api, ApiError } from './api';
import { useT } from './i18n';

interface Warning {
  code: string;
  message: string;
}

type Result =
  | { status: 'ok'; commandId: string; summary: string; warnings: Warning[] }
  | { status: 'clarify'; commandId: string; question: string }
  | { status: 'unsupported' | 'rejected'; commandId: string; message: string; supported: string[] };

interface Usage {
  used: number;
  limit: number;
  enabled: boolean;
}

const EXAMPLES = [
  'Make the navbar dark blue',
  'Change font to Poppins',
  'Hide the testimonials section',
  'navbar ka color kala kardo',
];

/**
 * FR-7.1: plain-language design changes. The suggestion is previewed first; nothing is saved until
 * the merchant presses Apply, and an applied change can be undone.
 */
export function CommandBox({
  storeId,
  disabledReason,
  language,
  onProposal,
  onApplied,
  onUndone,
}: {
  storeId: string;
  /** Shown instead of the box (e.g. unsaved manual edits). */
  disabledReason: string | null;
  language: 'en' | 'ur';
  /** Pending suggestion id for the preview, or null when there is none. */
  onProposal: (commandId: string | null) => void;
  onApplied: () => Promise<void>;
  onUndone: () => Promise<void>;
}) {
  const t = useT();
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState<'ask' | 'apply' | 'discard' | 'undo' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoVersionId, setUndoVersionId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const loadUsage = useCallback(
    () =>
      api<Usage>(`/stores/${storeId}/commands/usage`)
        .then(setUsage)
        .catch(() => setUsage(null)),
    [storeId],
  );

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy('ask');
    setError(null);
    setResult(null);
    setUndoVersionId(null);
    onProposal(null);
    try {
      const res = await api<Result>(`/stores/${storeId}/commands`, {
        method: 'POST',
        body: { command: trimmed, language },
      });
      setResult(res);
      if (res.status === 'ok') onProposal(res.commandId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(null);
      void loadUsage();
    }
  }

  async function apply() {
    if (result?.status !== 'ok') return;
    setBusy('apply');
    setError(null);
    try {
      const res = await api<{ undoVersionId: string | null }>(
        `/stores/${storeId}/commands/${result.commandId}/apply`,
        { method: 'POST' },
      );
      setUndoVersionId(res.undoVersionId);
      setResult(null);
      setCommand('');
      onProposal(null);
      await onApplied();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Could not apply the change'));
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!result) return;
    setBusy('discard');
    try {
      if (result.status === 'ok')
        await api(`/stores/${storeId}/commands/${result.commandId}/discard`, { method: 'POST' });
    } finally {
      setResult(null);
      onProposal(null);
      setBusy(null);
    }
  }

  async function undo() {
    if (!undoVersionId) return;
    setBusy('undo');
    try {
      await api(`/stores/${storeId}/versions/${undoVersionId}/restore`, { method: 'POST' });
      setUndoVersionId(null);
      await onUndone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not undo'));
    } finally {
      setBusy(null);
    }
  }

  if (usage && !usage.enabled) {
    return (
      <section
        aria-label={t('Design assistant')}
        className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 shadow-xs"
      >
        {t(
          'The design assistant is not available right now. You can still change everything with the settings below.',
        )}
      </section>
    );
  }

  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
  return (
    <section
      aria-label={t('Design assistant')}
      className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">{t('Ask the assistant')}</h2>
        {left !== null ? (
          <span className="text-xs text-neutral-500">{t('{n} left today', { n: left })}</span>
        ) : null}
      </div>
      {disabledReason ? (
        <p className="text-sm text-neutral-600">{disabledReason}</p>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(command);
            }}
          >
            <label className="flex-1">
              <span className="sr-only">{t('Describe a design change')}</span>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                maxLength={300}
                placeholder={t('e.g. Make the navbar dark blue')}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={busy !== null || left === 0}
              />
            </label>
            <Button type="submit" loading={busy === 'ask'} disabled={!command.trim() || left === 0}>
              {t('Suggest')}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2" aria-label={t('Examples')}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy !== null || left === 0}
                onClick={() => {
                  setCommand(ex);
                  void ask(ex);
                }}
                className="rounded-full bg-white px-3 py-1 text-xs text-neutral-700 ring-1 ring-neutral-200 hover:ring-indigo-300 disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </>
      )}

      <div aria-live="polite" className="space-y-2">
        {busy === 'ask' ? (
          <p className="flex items-center gap-2 text-sm text-neutral-600">
            <Spinner /> {t('Working on it…')}
          </p>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {result?.status === 'ok' ? (
          <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-indigo-200">
            <p className="text-sm">
              <span className="font-medium">{t('Suggested:')}</span>{' '}
              {result.summary || t('Design change ready.')}
            </p>
            <p className="text-xs text-neutral-500">
              {t('The preview shows this change. It is not saved yet.')}
            </p>
            {result.warnings.map((w, i) => (
              <Notice key={i} tone="error">
                {w.message}
              </Notice>
            ))}
            <div className="flex gap-2">
              <Button onClick={apply} loading={busy === 'apply'}>
                {t('Apply')}
              </Button>
              <Button variant="secondary" onClick={discard} loading={busy === 'discard'}>
                {t('Discard')}
              </Button>
            </div>
          </div>
        ) : null}
        {result?.status === 'clarify' ? <Notice>{result.question}</Notice> : null}
        {result && (result.status === 'unsupported' || result.status === 'rejected') ? (
          <div className="rounded-lg bg-white p-3 text-sm ring-1 ring-neutral-200">
            <p className="font-medium">{result.message}</p>
            <p className="mt-2 text-neutral-600">{t('I can:')}</p>
            <ul className="list-disc ps-5 text-neutral-600">
              {result.supported.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {undoVersionId ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm ring-1 ring-green-200">
            <span>{t('Change applied to your draft.')}</span>
            <Button variant="secondary" onClick={undo} loading={busy === 'undo'}>
              {t('Undo')}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
