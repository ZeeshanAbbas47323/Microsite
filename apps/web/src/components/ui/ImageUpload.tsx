'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { uploadImage } from '@/dashboard/api';
import { Button, Spinner } from './index';

/** Upload an image (or keep a pasted https URL) for a logo or section image. */
export function ImageUpload({
  storeId,
  value,
  onChange,
  purpose,
  label,
}: {
  storeId: string;
  value: string;
  onChange: (url: string) => void;
  purpose: 'logo' | 'image';
  label: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadImage(storeId, file, purpose);
      onChange(asset.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="text-sm font-medium text-neutral-800">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          {busy ? (
            <Spinner />
          ) : value ? (
            <Image
              src={value}
              alt=""
              width={128}
              height={128}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-neutral-400">None</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif,.avif,.webp,.jpg,.jpeg,.png,.gif,.svg"
            className="sr-only"
            id={id}
            aria-labelledby={`${id}-label`}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => input.current?.click()} loading={busy}>
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value ? (
            <Button variant="ghost" onClick={() => onChange('')}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        JPG, PNG, WebP or GIF{purpose === 'logo' ? ' (or SVG), max 2 MB' : ', max 5 MB'}.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
