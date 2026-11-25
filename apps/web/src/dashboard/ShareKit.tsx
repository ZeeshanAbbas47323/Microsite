'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Button, Notice } from '@/components/ui';

export interface ShareInfo {
  name: string;
  tagline: string;
  url: string | null;
  live: boolean;
  city: string;
  category: string;
  colors: { primary: string; secondary: string; background: string };
}

const W = 1080;
const H = 1350;

/** Black or white, whichever reads better on `hex`. */
function ink(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

/** Largest font size (from `max`) at which `text` fits `width`. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  max: number,
  width: number,
) {
  let size = max;
  do {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    if (ctx.measureText(text).width <= width) break;
    size -= 4;
  } while (size > 24);
  return size;
}

async function drawPoster(canvas: HTMLCanvasElement, info: ShareInfo) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { primary, secondary, background } = info.colors;
  const url = info.url ?? '';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  // Brand band
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, W, 500);
  ctx.fillStyle = ink(primary);
  fit(ctx, info.name, 800, 96, W - 140);
  ctx.fillText(info.name, W / 2, 200);
  if (info.tagline) {
    fit(ctx, info.tagline, 500, 42, W - 160);
    ctx.globalAlpha = 0.92;
    ctx.fillText(info.tagline, W / 2, 300);
    ctx.globalAlpha = 1;
  }
  fit(ctx, 'NOW ONLINE', 700, 30, W);
  ctx.fillText('N O W   O N L I N E', W / 2, 400);

  // QR card
  const card = { x: 270, y: 430, size: 540 };
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.roundRect(card.x, card.y, card.size, card.size, 36);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (url) {
    const qr = new Image();
    qr.src = await QRCode.toDataURL(url, { width: 460, margin: 0, errorCorrectionLevel: 'M' });
    await qr.decode();
    ctx.drawImage(qr, card.x + 40, card.y + 40, 460, 460);
  }

  ctx.fillStyle = ink(background);
  fit(ctx, 'Scan to shop', 800, 60, W);
  ctx.fillText('Scan to shop', W / 2, 1060);
  fit(ctx, url.replace(/^https?:\/\//, ''), 500, 34, W - 120);
  ctx.globalAlpha = 0.75;
  ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, 1125);
  ctx.globalAlpha = 1;

  // Promise strip
  ctx.fillStyle = secondary;
  ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = ink(secondary);
  const strip = 'Cash on delivery  •  Delivery across Pakistan';
  fit(ctx, strip, 700, 36, W - 100);
  ctx.fillText(strip, W / 2, H - 75);
}

function caption(info: ShareInfo) {
  const tags = [
    'ShopOnline',
    'CashOnDelivery',
    info.city.replace(/\s+/g, ''),
    info.category.replace(/[^a-z]/gi, ''),
  ]
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(' ');
  return [
    `${info.name} ab online hai! 🛍️`,
    info.tagline,
    'Cash on delivery • Delivery across Pakistan',
    info.url ? `Order now: ${info.url}` : '',
    tags,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Share kit: QR poster (PNG), WhatsApp share and a ready Instagram caption. */
export function ShareKit({ info, onClose }: { info: ShareInfo; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const text = caption(info);

  useEffect(() => {
    if (canvas.current) void drawPoster(canvas.current, info);
  }, [info]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  function download() {
    const link = document.createElement('a');
    link.download = `${info.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'store'}-poster.png`;
    link.href = canvas.current?.toDataURL('image/png') ?? '';
    link.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="grid max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      >
        <div className="flex items-center justify-center bg-neutral-100 p-5">
          <canvas
            ref={canvas}
            width={W}
            height={H}
            aria-label={`Poster for ${info.name} with a QR code to the store`}
            role="img"
            className="h-auto w-full max-w-xs rounded-xl shadow-lg"
          />
        </div>
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="share-title" className="text-xl font-bold">
                Share your store
              </h2>
              <p className="text-sm text-neutral-600">
                Posters, WhatsApp and Instagram in one place.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>
          {!info.live ? (
            <Notice tone="error">
              Your store is not published yet. Publish it first so the link and QR code work.
            </Notice>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Poster with QR code</p>
            <p className="text-sm text-neutral-600">
              Print it for your counter or post it on Instagram (1080 × 1350).
            </p>
            <Button onClick={download} disabled={!info.url}>
              ⬇ Download poster
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Send on WhatsApp</p>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f8f4e] px-4 text-sm font-semibold text-white hover:bg-[#187a42]"
            >
              Share on WhatsApp
            </a>
          </div>

          <div className="space-y-2">
            <label htmlFor="share-caption" className="block text-sm font-semibold">
              Instagram / Facebook caption
            </label>
            <textarea
              id="share-caption"
              readOnly
              rows={5}
              value={text}
              className="w-full rounded-lg border border-neutral-300 p-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copy(text, 'caption')}>
                {copied === 'caption' ? 'Copied ✓' : 'Copy caption'}
              </Button>
              {info.url ? (
                <Button variant="secondary" onClick={() => void copy(info.url ?? '', 'link')}>
                  {copied === 'link' ? 'Copied ✓' : 'Copy store link'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
