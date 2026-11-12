'use client';

import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/** Small, accessible UI kit for the merchant dashboard (neutral look, independent of store themes). */

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary:
    'bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400',
  ghost: 'text-neutral-700 hover:bg-neutral-100',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
} as const;

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label} {optional ? <span className="font-normal text-neutral-500">(optional)</span> : null}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const control =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 aria-[invalid=true]:border-red-500';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-10 ${control} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`py-2 ${control} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-10 ${control} ${props.className ?? ''}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium text-neutral-800">
          {label}
        </p>
        {description ? <p className="text-xs text-neutral-500">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 ${checked ? 'bg-indigo-600' : 'bg-neutral-300'}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const id = useId();
  const valid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
  const full =
    valid && value.length === 4 ? `#${value.slice(1).replace(/./g, (c) => c + c)}` : value;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? full : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          aria-invalid={!valid || undefined}
          className="font-mono"
        />
      </div>
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-xs ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold text-neutral-900">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const badgeTones = {
  green: 'bg-green-50 text-green-800 ring-green-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'error' | 'success';
  children: ReactNode;
}) {
  const cls =
    tone === 'error'
      ? 'bg-red-50 text-red-800 ring-red-200'
      : tone === 'success'
        ? 'bg-green-50 text-green-800 ring-green-200'
        : 'bg-neutral-50 text-neutral-700 ring-neutral-200';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg p-3 text-sm ring-1 ring-inset ${cls}`}
    >
      {children}
    </div>
  );
}
