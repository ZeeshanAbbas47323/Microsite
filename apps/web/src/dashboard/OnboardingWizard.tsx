'use client';

import {
  BUSINESS_CATEGORIES,
  FONT_WHITELIST,
  onboardingInputSchema,
  type OnboardingInput,
} from '@microstore/site-schema';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  ColorInput,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
  Toggle,
} from '@/components/ui';
import { api, ApiError, type Store } from './api';
import { useDashboard } from './session';

const STEPS = ['Business', 'Branding', 'Contact', 'Pages', 'Layout', 'Address'] as const;
type Errors = Record<string, string>;

interface LayoutMeta {
  id: string;
  name: string;
  description: string;
}

const CATEGORY_LABELS: Record<(typeof BUSINESS_CATEGORIES)[number], string> = {
  fashion: 'Fashion & clothing',
  electronics: 'Electronics',
  beauty: 'Beauty & personal care',
  food: 'Food & bakery',
  grocery: 'Grocery',
  'home-decor': 'Home & decor',
  handmade: 'Handmade & crafts',
  general: 'Something else',
};

function emptyDraft(): OnboardingInput {
  return {
    business: { name: '', tagline: '', description: '', category: 'general' },
    branding: {
      logoUrl: '',
      primaryColor: '#4f46e5',
      secondaryColor: '#f59e0b',
      fontFamily: 'Poppins',
    },
    contact: {
      phone: '',
      whatsapp: '',
      email: '',
      address: '',
      city: '',
      social: { facebook: '', instagram: '', tiktok: '' },
    },
    pages: { about: true, contact: true, custom: null },
    layoutId: 'bold-01',
    subdomain: '',
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Zod issues → `{ "contact.phone": "message" }`. */
function issuesToErrors(issues: { path: PropertyKey[]; message: string }[], prefix = ''): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const key = [prefix, ...i.path.map(String)].filter(Boolean).join('.');
    out[key] ??= i.message;
  }
  return out;
}

const SHAPE = onboardingInputSchema.shape;

function validateStep(step: number, d: OnboardingInput): Errors {
  const check = (
    prefix: string,
    schema: {
      safeParse: (v: unknown) => {
        success: boolean;
        error?: { issues: { path: PropertyKey[]; message: string }[] };
      };
    },
    value: unknown,
  ) => {
    const r = schema.safeParse(value);
    return r.success ? {} : issuesToErrors(r.error?.issues ?? [], prefix);
  };
  switch (step) {
    case 0:
      return check('business', SHAPE.business, d.business);
    case 1:
      return check('branding', SHAPE.branding, d.branding);
    case 2:
      return check('contact', SHAPE.contact, d.contact);
    case 3:
      return check('pages', SHAPE.pages, d.pages);
    case 4:
      return check('layoutId', SHAPE.layoutId, d.layoutId);
    default:
      return check('subdomain', SHAPE.subdomain, d.subdomain);
  }
}

const STEP_OF_FIELD: [string, number][] = [
  ['business', 0],
  ['branding', 1],
  ['contact', 2],
  ['pages', 3],
  ['layoutId', 4],
  ['subdomain', 5],
];

/** FR-1.2: multi-step store creation with progress and draft autosave. */
export function OnboardingWizard({ rootDomain }: { rootDomain: string }) {
  const { session, setStore } = useDashboard();
  const router = useRouter();
  const storageKey = `ms_onboarding_${session.merchant.tenantId}`;
  const [draft, setDraft] = useState<OnboardingInput>(emptyDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<LayoutMeta[]>([]);
  const loaded = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Restore and autosave the draft.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { draft: OnboardingInput; step: number };
        setDraft({ ...emptyDraft(), ...parsed.draft });
        setStep(Math.min(STEPS.length - 1, parsed.step ?? 0));
      }
    } catch {
      // ignore broken drafts
    }
    loaded.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ draft, step }));
    } catch {
      // storage unavailable
    }
  }, [draft, step, storageKey]);

  useEffect(() => {
    api<{ layouts: LayoutMeta[] }>('/layouts')
      .then((r) => setLayouts(r.layouts))
      .catch(() => setLayouts([]));
  }, []);

  useEffect(() => heading.current?.focus(), [step]);

  const set = <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const err = (path: string) => errors[path];

  function next() {
    const e = validateStep(step, draft);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function submit() {
    const e = validateStep(5, draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const { store } = await api<{ store: Store }>('/stores', { method: 'POST', body: draft });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      setStore(store);
      router.replace('/dashboard/design?welcome=1');
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'validation_error' &&
        Array.isArray(error.details)
      ) {
        const map: Errors = {};
        for (const d of error.details as { path: string; message: string }[])
          map[d.path] ??= d.message;
        setErrors(map);
        const first = Object.keys(map)[0] ?? '';
        const target = STEP_OF_FIELD.find(([prefix]) => first.startsWith(prefix));
        if (target) setStep(target[1]);
        setFormError('Some details need fixing.');
      } else if (error instanceof ApiError && error.status === 409) {
        setErrors({ subdomain: error.message });
        setFormError(error.message);
      } else {
        setFormError(error instanceof Error ? error.message : 'Could not create the store.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm font-medium text-indigo-700">Create your store</p>
      <ol className="mt-3 grid grid-cols-6 gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="space-y-1">
            <div
              className={`h-1.5 rounded-full ${i <= step ? 'bg-indigo-600' : 'bg-neutral-200'}`}
            />
            <span
              className={`hidden text-xs sm:block ${i === step ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}
              {...(i === step ? { 'aria-current': 'step' as const } : {})}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-xs">
        <h1 ref={heading} tabIndex={-1} className="mb-1 text-xl font-semibold outline-none">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </h1>
        <p className="mb-6 text-sm text-neutral-500">Your progress is saved on this device.</p>

        {step === 0 ? (
          <Stack>
            <Field label="Store name" error={err('business.name')}>
              {(p) => (
                <Input
                  {...p}
                  value={draft.business.name}
                  maxLength={80}
                  onChange={(e) => set('business', { ...draft.business, name: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Tagline"
              optional
              hint="A short line under your name, e.g. “Handmade with love”."
              error={err('business.tagline')}
            >
              {(p) => (
                <Input
                  {...p}
                  value={draft.business.tagline}
                  maxLength={120}
                  onChange={(e) => set('business', { ...draft.business, tagline: e.target.value })}
                />
              )}
            </Field>
            <Field label="Short description" optional error={err('business.description')}>
              {(p) => (
                <Textarea
                  {...p}
                  value={draft.business.description}
                  maxLength={500}
                  onChange={(e) =>
                    set('business', { ...draft.business, description: e.target.value })
                  }
                />
              )}
            </Field>
            <Field label="What do you sell?" error={err('business.category')}>
              {(p) => (
                <Select
                  {...p}
                  value={draft.business.category}
                  onChange={(e) =>
                    set('business', {
                      ...draft.business,
                      category: e.target.value as OnboardingInput['business']['category'],
                    })
                  }
                >
                  {BUSINESS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Stack>
        ) : null}

        {step === 1 ? (
          <Stack>
            <Field
              label="Logo URL"
              optional
              hint="An https link to your logo. Uploading files is coming soon."
              error={err('branding.logoUrl')}
            >
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  placeholder="https://"
                  value={draft.branding.logoUrl}
                  onChange={(e) => set('branding', { ...draft.branding, logoUrl: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorInput
                label="Primary color"
                value={draft.branding.primaryColor}
                onChange={(v) => set('branding', { ...draft.branding, primaryColor: v })}
              />
              <ColorInput
                label="Secondary color"
                value={draft.branding.secondaryColor}
                onChange={(v) => set('branding', { ...draft.branding, secondaryColor: v })}
              />
            </div>
            {err('branding.primaryColor') || err('branding.secondaryColor') ? (
              <Notice tone="error">Colors must look like #1a73e8.</Notice>
            ) : null}
            <Field label="Font" error={err('branding.fontFamily')}>
              {(p) => (
                <Select
                  {...p}
                  value={draft.branding.fontFamily}
                  onChange={(e) =>
                    set('branding', {
                      ...draft.branding,
                      fontFamily: e.target.value as OnboardingInput['branding']['fontFamily'],
                    })
                  }
                >
                  {FONT_WHITELIST.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              )}
            </Field>
          </Stack>
        ) : null}

        {step === 2 ? (
          <Stack>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" hint="03XX XXXXXXX" error={err('contact.phone')}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    inputMode="tel"
                    value={draft.contact.phone}
                    onChange={(e) => set('contact', { ...draft.contact, phone: e.target.value })}
                  />
                )}
              </Field>
              <Field label="WhatsApp" optional error={err('contact.whatsapp')}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    inputMode="tel"
                    value={draft.contact.whatsapp}
                    onChange={(e) => set('contact', { ...draft.contact, whatsapp: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field label="Email" optional error={err('contact.email')}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={draft.contact.email}
                  onChange={(e) => set('contact', { ...draft.contact, email: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" error={err('contact.city')}>
                {(p) => (
                  <Input
                    {...p}
                    value={draft.contact.city}
                    onChange={(e) => set('contact', { ...draft.contact, city: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Address" optional error={err('contact.address')}>
                {(p) => (
                  <Input
                    {...p}
                    value={draft.contact.address}
                    onChange={(e) => set('contact', { ...draft.contact, address: e.target.value })}
                  />
                )}
              </Field>
            </div>
            {(['facebook', 'instagram', 'tiktok'] as const).map((net) => (
              <Field
                key={net}
                label={net === 'tiktok' ? 'TikTok' : net[0]?.toUpperCase() + net.slice(1)}
                optional
                error={err(`contact.social.${net}`)}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    placeholder={`https://${net}.com/yourshop`}
                    value={draft.contact.social[net]}
                    onChange={(e) =>
                      set('contact', {
                        ...draft.contact,
                        social: { ...draft.contact.social, [net]: e.target.value },
                      })
                    }
                  />
                )}
              </Field>
            ))}
          </Stack>
        ) : null}

        {step === 3 ? (
          <Stack>
            <p className="text-sm text-neutral-600">
              Home and Products are always included. Choose up to three more pages.
            </p>
            <Toggle
              label="About us"
              checked={draft.pages.about}
              onChange={(v) => set('pages', { ...draft.pages, about: v })}
            />
            <Toggle
              label="Contact"
              checked={draft.pages.contact}
              onChange={(v) => set('pages', { ...draft.pages, contact: v })}
            />
            <Toggle
              label="One extra page"
              description="For example FAQ, Policies or Shipping."
              checked={draft.pages.custom !== null}
              onChange={(v) =>
                set('pages', {
                  ...draft.pages,
                  custom: v ? { title: 'Policies', slug: 'policies' } : null,
                })
              }
            />
            {draft.pages.custom ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Page title" error={err('pages.custom.title')}>
                  {(p) => (
                    <Input
                      {...p}
                      value={draft.pages.custom?.title ?? ''}
                      maxLength={60}
                      onChange={(e) =>
                        set('pages', {
                          ...draft.pages,
                          custom: { title: e.target.value, slug: slugify(e.target.value) },
                        })
                      }
                    />
                  )}
                </Field>
                <Field
                  label="Address"
                  hint="Lowercase letters, digits and hyphens."
                  error={err('pages.custom.slug')}
                >
                  {(p) => (
                    <Input
                      {...p}
                      value={draft.pages.custom?.slug ?? ''}
                      onChange={(e) =>
                        set('pages', {
                          ...draft.pages,
                          custom: {
                            title: draft.pages.custom?.title ?? '',
                            slug: e.target.value.toLowerCase(),
                          },
                        })
                      }
                    />
                  )}
                </Field>
              </div>
            ) : null}
          </Stack>
        ) : null}

        {step === 4 ? (
          <fieldset>
            <legend className="mb-3 text-sm text-neutral-600">
              Pick a look. You can switch later without losing content.
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {layouts.map((l) => (
                <label
                  key={l.id}
                  className="cursor-pointer rounded-xl border-2 border-neutral-200 p-3 has-[:checked]:border-indigo-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300"
                >
                  <input
                    type="radio"
                    name="layout"
                    value={l.id}
                    checked={draft.layoutId === l.id}
                    onChange={() => set('layoutId', l.id)}
                    className="sr-only"
                  />
                  <LayoutThumb
                    id={l.id}
                    primary={draft.branding.primaryColor}
                    secondary={draft.branding.secondaryColor}
                    name={draft.business.name || 'Your store'}
                  />
                  <p className="mt-3 font-semibold">{l.name}</p>
                  <p className="text-sm text-neutral-600">{l.description}</p>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 5 ? (
          <SubdomainStep
            value={draft.subdomain}
            onChange={(v) => set('subdomain', v)}
            rootDomain={rootDomain}
            error={err('subdomain')}
          />
        ) : null}

        {formError ? (
          <div className="mt-6">
            <Notice tone="error">{formError}</Notice>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={submit} loading={submitting}>
              Create my store
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

/** Live mini preview of a layout in the merchant's colors (FR-1.2 step 5). */
function LayoutThumb({
  id,
  primary,
  secondary,
  name,
}: {
  id: string;
  primary: string;
  secondary: string;
  name: string;
}) {
  const bold = id === 'bold-01';
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-[8px]"
      aria-hidden="true"
    >
      <div
        className={`flex items-center justify-between px-2 py-1.5 ${bold ? 'bg-neutral-900 text-white' : 'border-b border-neutral-100'}`}
      >
        <span className="font-bold">{name.slice(0, 18)}</span>
        <span>☰</span>
      </div>
      {bold ? (
        <div className="px-2 py-4 text-white" style={{ background: primary }}>
          <div className="text-[11px] font-extrabold leading-tight">Welcome</div>
          <div
            className="mt-1.5 inline-block rounded-full bg-white px-1.5 py-0.5 font-semibold"
            style={{ color: primary }}
          >
            Shop now
          </div>
        </div>
      ) : (
        <div className="px-2 py-4 text-center">
          <div className="text-[11px] font-semibold leading-tight">Welcome</div>
          <div
            className="mt-1.5 inline-block rounded px-1.5 py-0.5 font-semibold text-white"
            style={{ background: primary }}
          >
            Shop now
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1 p-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`aspect-square ${bold ? 'rounded shadow-sm' : 'rounded-sm border border-neutral-200'}`}
            style={{ background: i === 1 ? secondary : '#e5e7eb' }}
          />
        ))}
      </div>
    </div>
  );
}

function SubdomainStep({
  value,
  onChange,
  rootDomain,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  rootDomain: string;
  error?: string;
}) {
  const [status, setStatus] = useState<{ available: boolean; message?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const normalized = useMemo(() => value.trim().toLowerCase(), [value]);

  useEffect(() => {
    if (!normalized) {
      setStatus(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      api<{ available: boolean; message?: string }>(
        `/subdomains/check?name=${encodeURIComponent(normalized)}`,
      )
        .then(setStatus)
        .catch(() => setStatus(null))
        .finally(() => setChecking(false));
    }, 350);
    return () => clearTimeout(t);
  }, [normalized]);

  return (
    <Field
      label="Store address"
      error={error ?? (status && !status.available ? status.message : undefined)}
      hint="3–30 lowercase letters, digits or hyphens."
    >
      {(p) => (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              {...p}
              value={value}
              onChange={(e) => onChange(e.target.value.toLowerCase())}
              placeholder="yourshop"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="shrink-0 text-sm text-neutral-500">.{rootDomain}</span>
          </div>
          <p aria-live="polite" className="min-h-5 text-sm">
            {checking ? (
              <span className="text-neutral-500">Checking…</span>
            ) : status?.available ? (
              <span className="text-green-700">
                ✓ {normalized}.{rootDomain} is available
              </span>
            ) : null}
          </p>
        </div>
      )}
    </Field>
  );
}
