/**
 * Dev only: draws one illustration per mock-catalog product and writes 800×800 WebP files to
 * apps/web/public/demo-products/<id>.webp (served by the web app as /demo-products/<id>.webp).
 * Re-run after changing a drawing:
 *
 *   pnpm --filter @microstore/api demo:images
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = new URL('../../web/public/demo-products/', import.meta.url);

/** Soft studio background per category (matches the old placeholder colors). */
const BG = {
  bags: ['#f7efe4', '#ead8c0'],
  accessories: ['#eef4fa', '#d3e3f1'],
  footwear: ['#f4eefa', '#e0d2ef'],
  home: ['#eef7f0', '#d3ebd9'],
} as const;

const shadow = (cx = 400, cy = 690, rx = 230) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="26" fill="#000" opacity=".12"/>`;

const DRAWINGS: Record<string, { bg: keyof typeof BG; svg: string }> = {
  // Leather Tote Bag
  'p-1001': {
    bg: 'bags',
    svg: `${shadow()}
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#9a5b2b"/><stop offset="1" stop-color="#7a4520"/></linearGradient></defs>
      <path d="M300 300 Q300 170 400 170 Q500 170 500 300" fill="none" stroke="#6b3b1a" stroke-width="22" stroke-linecap="round"/>
      <path d="M335 300 Q335 205 400 205 Q465 205 465 300" fill="none" stroke="#5a3115" stroke-width="16" stroke-linecap="round"/>
      <path d="M215 290 H585 L630 680 H170 Z" fill="url(#g)"/>
      <path d="M215 290 H585 L592 350 H208 Z" fill="#000" opacity=".12"/>
      <path d="M232 320 H568 L610 655 H190 Z" fill="none" stroke="#e8c79f" stroke-width="4" stroke-dasharray="14 10" opacity=".8"/>
      <rect x="370" y="380" width="60" height="40" rx="6" fill="#d9b27c"/>`,
  },
  // Embroidered Clutch
  'p-1002': {
    bg: 'accessories',
    svg: `${shadow(400, 640, 250)}
      <rect x="160" y="300" width="480" height="320" rx="34" fill="#8b1e3f"/>
      <path d="M160 334 Q160 300 194 300 H606 Q640 300 640 334 L400 500 Z" fill="#a8274f"/>
      <path d="M190 330 L400 478 L610 330" fill="none" stroke="#f2c14e" stroke-width="5" stroke-dasharray="3 9" stroke-linecap="round"/>
      ${[250, 330, 470, 550]
        .map(
          (x) =>
            `<g transform="translate(${x} 560)"><circle r="16" fill="#f2c14e"/><circle r="7" fill="#8b1e3f"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="7" ry="15" transform="rotate(${a}) translate(0 -24)" fill="#f7d98b"/>`).join('')}</g>`,
        )
        .join('')}
      <circle cx="400" cy="492" r="20" fill="#f2c14e" stroke="#c9952a" stroke-width="5"/>`,
  },
  // Block Print Scarf
  'p-1003': {
    bg: 'accessories',
    svg: `${shadow(400, 690, 200)}
      <defs><pattern id="bp" width="70" height="70" patternUnits="userSpaceOnUse"><rect width="70" height="70" fill="#f4e6cf"/><circle cx="35" cy="35" r="15" fill="none" stroke="#b5452b" stroke-width="5"/><circle cx="35" cy="35" r="5" fill="#2f4d7a"/><circle cx="0" cy="0" r="7" fill="#2f4d7a"/><circle cx="70" cy="70" r="7" fill="#2f4d7a"/><circle cx="70" cy="0" r="7" fill="#2f4d7a"/><circle cx="0" cy="70" r="7" fill="#2f4d7a"/></pattern></defs>
      <path d="M250 150 H550 Q600 400 520 660 H280 Q200 400 250 150 Z" fill="url(#bp)"/>
      <path d="M250 150 Q330 300 300 660 H280 Q200 400 250 150 Z" fill="#000" opacity=".1"/>
      <path d="M550 150 Q470 300 500 660 H520 Q600 400 550 150 Z" fill="#000" opacity=".08"/>
      <rect x="250" y="150" width="300" height="22" fill="#b5452b"/>
      ${Array.from({ length: 13 }, (_, i) => `<line x1="${290 + i * 19}" y1="660" x2="${288 + i * 19}" y2="700" stroke="#b5452b" stroke-width="5" stroke-linecap="round"/>`).join('')}`,
  },
  // Classic Khussa
  'p-1004': {
    bg: 'footwear',
    svg: `${shadow(400, 600, 270)}
      <path d="M140 560 Q120 470 210 450 L360 410 Q470 380 560 420 Q640 450 690 400 Q700 455 655 520 Q610 585 520 590 H200 Q150 590 140 560 Z" fill="#c8892d"/>
      <path d="M690 400 Q720 370 700 340 Q680 330 672 352" fill="none" stroke="#c8892d" stroke-width="16" stroke-linecap="round"/>
      <path d="M150 585 H530 Q610 580 650 535" fill="none" stroke="#5b2a12" stroke-width="18" stroke-linecap="round"/>
      <path d="M215 455 Q300 500 360 412" fill="#4a2410" opacity=".9"/>
      <path d="M380 420 Q470 440 560 430 Q600 470 560 520 Q470 540 400 520 Q360 470 380 420 Z" fill="#7a1f2b"/>
      ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${405 + i * 34}" cy="${470 + (i % 2) * 18}" r="9" fill="#f2c14e"/>`).join('')}
      <path d="M390 500 Q470 520 555 500" fill="none" stroke="#f2c14e" stroke-width="5" stroke-dasharray="4 8" stroke-linecap="round"/>`,
  },
  // Scented Soy Candle
  'p-1005': {
    bg: 'home',
    svg: `${shadow(400, 670, 170)}
      <defs><radialGradient id="fl" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#fff6c2"/><stop offset=".6" stop-color="#ffb52e"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient></defs>
      <circle cx="400" cy="250" r="70" fill="#ffd36b" opacity=".25"/>
      <path d="M400 190 Q430 245 400 285 Q370 245 400 190 Z" fill="url(#fl)"/>
      <line x1="400" y1="285" x2="400" y2="320" stroke="#333" stroke-width="5"/>
      <rect x="250" y="300" width="300" height="370" rx="30" fill="#e9eef0" opacity=".9"/>
      <rect x="262" y="330" width="276" height="328" rx="22" fill="#f8f1e3"/>
      <ellipse cx="400" cy="330" rx="138" ry="22" fill="#fdf8ee"/>
      <rect x="290" y="450" width="220" height="120" rx="10" fill="#3f6b4f"/>
      <text x="400" y="505" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#f8f1e3">SOY</text>
      <text x="400" y="545" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#cfe3d5">jasmine</text>`,
  },
  // Blue Pottery Mug
  'p-1006': {
    bg: 'home',
    svg: `${shadow(380, 660, 190)}
      <path d="M545 360 Q650 360 650 460 Q650 560 540 560" fill="none" stroke="#f4f7fb" stroke-width="44"/>
      <path d="M545 360 Q650 360 650 460 Q650 560 540 560" fill="none" stroke="#1d4f91" stroke-width="8"/>
      <path d="M220 290 H560 V600 Q560 660 500 660 H280 Q220 660 220 600 Z" fill="#f4f7fb"/>
      <ellipse cx="390" cy="290" rx="170" ry="30" fill="#dfe8f2"/>
      <ellipse cx="390" cy="290" rx="150" ry="22" fill="#8a5a3c"/>
      <rect x="220" y="320" width="340" height="16" fill="#1d4f91"/>
      <rect x="220" y="610" width="340" height="12" fill="#1d4f91"/>
      ${[300, 390, 480]
        .map(
          (x) =>
            `<g transform="translate(${x} 470)"><circle r="20" fill="#2d7dd2"/>${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse rx="12" ry="30" transform="rotate(${a}) translate(0 -40)" fill="#1d4f91"/>`).join('')}<circle r="9" fill="#7fc4ff"/></g>`,
        )
        .join('')}`,
  },
  // Discontinued Satchel
  'p-1007': {
    bg: 'bags',
    svg: `${shadow()}
      <path d="M230 330 Q230 140 400 140 Q570 140 570 330" fill="none" stroke="#4a2a14" stroke-width="18"/>
      <rect x="180" y="320" width="440" height="340" rx="40" fill="#6d4223"/>
      <path d="M180 360 Q180 320 220 320 H580 Q620 320 620 360 V480 Q400 540 180 480 Z" fill="#83522c"/>
      ${[300, 500].map((x) => `<rect x="${x - 22}" y="470" width="44" height="120" rx="8" fill="#4a2a14"/><rect x="${x - 30}" y="520" width="60" height="44" rx="6" fill="none" stroke="#d6a85c" stroke-width="8"/>`).join('')}
      <path d="M200 340 H600" stroke="#c99a68" stroke-width="3" stroke-dasharray="10 8"/>`,
  },
  // Jute Coaster Set (6)
  'p-1008': {
    bg: 'home',
    svg: `${shadow(400, 640, 260)}
      ${[0, 1, 2, 3]
        .map(
          (i) =>
            `<ellipse cx="300" cy="${590 - i * 26}" rx="150" ry="58" fill="${i % 2 ? '#b98a4e' : '#c99b5d'}"/><ellipse cx="300" cy="${578 - i * 26}" rx="150" ry="58" fill="#d8ae72"/>`,
        )
        .join('')}
      ${[0, 1, 2, 3, 4]
        .map(
          (r) =>
            `<ellipse cx="300" cy="500" rx="${140 - r * 26}" ry="${53 - r * 10}" fill="none" stroke="#a87a42" stroke-width="5"/>`,
        )
        .join('')}
      ${[
        [560, 470],
        [560, 600],
      ]
        .map(
          ([x, y]) =>
            `<circle cx="${x}" cy="${y}" r="88" fill="#d8ae72"/>${[0, 1, 2, 3].map((r) => `<circle cx="${x}" cy="${y}" r="${80 - r * 18}" fill="none" stroke="#a87a42" stroke-width="5"/>`).join('')}`,
        )
        .join('')}`,
  },
  // Slim Leather Wallet
  'p-1009': {
    bg: 'accessories',
    svg: `${shadow(400, 620, 240)}
      <rect x="230" y="270" width="250" height="160" rx="14" fill="#2d7dd2" transform="rotate(-10 355 350)"/>
      <rect x="250" y="300" width="80" height="20" rx="4" fill="#f2c14e" transform="rotate(-10 355 350)"/>
      <rect x="170" y="340" width="460" height="270" rx="30" fill="#3b2416"/>
      <rect x="170" y="340" width="460" height="70" rx="30" fill="#4d311f"/>
      <rect x="190" y="360" width="420" height="230" rx="20" fill="none" stroke="#b98a5e" stroke-width="4" stroke-dasharray="12 9"/>
      <rect x="560" y="440" width="70" height="60" rx="10" fill="#2b190f"/>`,
  },
  // Ajrak Pouch
  'p-1010': {
    bg: 'bags',
    svg: `${shadow(400, 640, 230)}
      <defs><pattern id="aj" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#8e1b1b"/><rect x="10" y="10" width="60" height="60" fill="#1b2a5c"/><path d="M40 16 L48 32 L64 40 L48 48 L40 64 L32 48 L16 40 L32 32 Z" fill="#f4ecdc"/><circle cx="40" cy="40" r="6" fill="#8e1b1b"/><circle cx="0" cy="0" r="6" fill="#f4ecdc"/><circle cx="80" cy="0" r="6" fill="#f4ecdc"/><circle cx="0" cy="80" r="6" fill="#f4ecdc"/><circle cx="80" cy="80" r="6" fill="#f4ecdc"/></pattern></defs>
      <path d="M170 330 Q170 300 200 300 H600 Q630 300 630 330 L610 600 Q605 630 575 630 H225 Q195 630 190 600 Z" fill="url(#aj)"/>
      <rect x="170" y="296" width="460" height="26" rx="10" fill="#1b1b1b"/>
      <path d="M180 309 H620" stroke="#bbb" stroke-width="4" stroke-dasharray="6 6"/>
      <rect x="578" y="300" width="22" height="56" rx="6" fill="#c9c9c9"/>
      <path d="M185 330 Q190 500 200 610" stroke="#000" stroke-width="30" opacity=".1" fill="none"/>`,
  },
  // Embroidered Cushion Cover
  'p-1011': {
    bg: 'home',
    svg: `${shadow(400, 670, 250)}
      <path d="M170 200 Q400 170 630 200 Q660 420 630 640 Q400 670 170 640 Q140 420 170 200 Z" fill="#e7d3a8"/>
      <path d="M170 200 Q400 170 630 200 Q660 420 630 640 Q400 670 170 640 Q140 420 170 200 Z" fill="none" stroke="#b5452b" stroke-width="10"/>
      <g transform="translate(400 420)">
        ${Array.from({ length: 12 }, (_, i) => `<ellipse rx="22" ry="80" transform="rotate(${i * 30}) translate(0 -95)" fill="${i % 2 ? '#2f4d7a' : '#b5452b'}"/>`).join('')}
        ${Array.from({ length: 8 }, (_, i) => `<ellipse rx="14" ry="40" transform="rotate(${i * 45}) translate(0 -50)" fill="#f2c14e"/>`).join('')}
        <circle r="28" fill="#2f4d7a"/><circle r="12" fill="#f2c14e"/>
      </g>
      ${[
        [175, 205],
        [625, 205],
        [175, 635],
        [625, 635],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="14" fill="#b5452b"/>`)
        .join('')}`,
  },
  // Canvas Backpack
  'p-1012': {
    bg: 'bags',
    svg: `${shadow(400, 690, 210)}
      <path d="M330 190 Q330 130 400 130 Q470 130 470 190" fill="none" stroke="#3d4a2a" stroke-width="20"/>
      <rect x="230" y="180" width="340" height="490" rx="90" fill="#6b7a45"/>
      <path d="M230 300 Q400 230 570 300 V330 Q400 260 230 330 Z" fill="#59673a"/>
      <rect x="280" y="430" width="240" height="190" rx="40" fill="#7d8c54"/>
      <path d="M280 480 H520" stroke="#3d4a2a" stroke-width="10"/>
      ${[330, 470].map((x) => `<rect x="${x - 14}" y="300" width="28" height="110" rx="8" fill="#8a5a3c"/><rect x="${x - 20}" y="380" width="40" height="26" rx="5" fill="none" stroke="#d6a85c" stroke-width="6"/>`).join('')}
      <path d="M240 260 V640" stroke="#000" stroke-width="20" opacity=".08"/>`,
  },
};

await mkdir(OUT, { recursive: true });
for (const [id, { bg, svg }] of Object.entries(DRAWINGS)) {
  const [from, to] = BG[bg];
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#bg)"/>${svg}</svg>`;
  await sharp(Buffer.from(doc))
    .webp({ quality: 82 })
    .toFile(new URL(`${id}.webp`, OUT).pathname);
  console.log(`wrote ${id}.webp`);
}
