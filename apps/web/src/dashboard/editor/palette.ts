/**
 * Brand colors from a logo or shop photo, in the browser (no upload needed). Pixels are bucketed
 * into a coarse color grid; near-white, near-black, grey and transparent pixels are ignored, and the
 * most common buckets that differ enough from each other win.
 */
export async function extractPalette(file: Blob, max = 3): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const size = 72;
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    if (a < 200) continue;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
    if (maxC > 242 && saturation < 0.12) continue; // white / paper
    if (maxC < 28) continue; // black
    if (saturation < 0.18) continue; // greys
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()]
    .map(({ count, r, g, b }) => ({ count, rgb: [r / count, g / count, b / count] as const }))
    .sort((a, b) => b.count - a.count);
  const chosen: (readonly [number, number, number])[] = [];
  for (const { rgb } of ranked) {
    if (chosen.every((c) => distance(c, rgb) > 60)) chosen.push(rgb);
    if (chosen.length >= max) break;
  }
  return chosen.map(toHex);
}

function distance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));
}

function toHex(rgb: readonly number[]) {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}
