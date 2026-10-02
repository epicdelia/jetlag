#!/usr/bin/env node
// Generates Shift's app icon, Android adaptive icon layers, splash mark and favicon.
// The artwork is original: a night-to-day gradient with a crescent moon setting and a
// sun rising over a horizon line. Source SVGs are written to assets/icon-src/ so they
// can be reviewed or edited; PNGs are rasterised with @resvg/resvg-js (devDependency).
//
//   npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets/icon-src');
const outDir = join(root, 'assets/images');
mkdirSync(srcDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const NIGHT = '#0E1220';
const DUSK = '#2B3A7A';
const DAWN = '#C9789A';
const DAY = '#F6B26B';
const SUN = '#FFE3A3';
const MOON = '#E9ECFF';

const gradientDefs = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${NIGHT}"/>
    <stop offset="0.42" stop-color="${DUSK}"/>
    <stop offset="0.78" stop-color="${DAWN}"/>
    <stop offset="1" stop-color="${DAY}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${SUN}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${SUN}" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="aboveHorizon"><rect x="0" y="0" width="1024" height="640"/></clipPath>`;

/**
 * The mark, drawn on a 1024 canvas centred on (512, 512). `scale` shrinks it around the
 * centre (Android adaptive foregrounds need the art inside the middle ~66%).
 * `mono` draws it in a single colour for monochrome/themed icons.
 */
function mark({ scale = 1, mono = null, glow = true } = {}) {
  const fill = (c) => mono ?? c;
  const t = `translate(512 512) scale(${scale}) translate(-512 -512)`;
  return `
  <g transform="${t}">
    ${glow && !mono ? '<circle cx="512" cy="640" r="300" fill="url(#glow)"/>' : ''}
    <!-- rising sun (half disc above the horizon) -->
    <g clip-path="url(#aboveHorizon)">
      <circle cx="512" cy="640" r="170" fill="${fill(SUN)}"/>
    </g>
    <!-- horizon -->
    <rect x="232" y="660" width="560" height="22" rx="11" fill="${fill(SUN)}"/>
    <!-- crescent moon, upper left -->
    <mask id="moonCut"><rect width="1024" height="1024" fill="#fff"/><circle cx="410" cy="322" r="84" fill="#000"/></mask>
    <circle cx="372" cy="346" r="96" fill="${fill(MOON)}" mask="url(#moonCut)"/>
    <!-- two small stars -->
    <circle cx="640" cy="300" r="12" fill="${fill(MOON)}"/>
    <circle cx="720" cy="390" r="8" fill="${fill(MOON)}"/>
  </g>`;
}

const svg = (body, { bg = true, size = 1024 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>${gradientDefs}</defs>
  ${bg ? '<rect width="1024" height="1024" fill="url(#sky)"/>' : ''}
  ${body}
</svg>
`;

const assets = {
  // iOS/universal app icon: full-bleed square, no transparency (iOS applies its own mask).
  icon: { svg: svg(mark()), sizes: [['icon.png', 1024]], opaque: true },
  // Android adaptive icon layers (108dp canvas; keep art in the central 66%).
  'android-icon-background': {
    svg: svg(''),
    sizes: [['android-icon-background.png', 1024]],
  },
  'android-icon-foreground': {
    svg: svg(mark({ scale: 0.85 }), { bg: false }),
    sizes: [['android-icon-foreground.png', 1024]],
  },
  'android-icon-monochrome': {
    svg: svg(mark({ scale: 0.85, mono: '#FFFFFF' }), { bg: false }),
    sizes: [['android-icon-monochrome.png', 1024]],
  },
  // Splash: transparent mark on the configured background colour.
  splash: {
    svg: svg(mark({ glow: false }), { bg: false }),
    sizes: [['splash-icon.png', 1024]],
  },
  favicon: { svg: svg(mark()), sizes: [['favicon.png', 48]] },
};

/** Encodes RGBA pixels as an RGB PNG (no alpha channel: App Store icons must not have one). */
function encodeRgbPng(rgba, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, { svg: s, sizes, opaque }] of Object.entries(assets)) {
  writeFileSync(join(srcDir, `${name}.svg`), s);
  for (const [file, px] of sizes) {
    const img = new Resvg(s, { fitTo: { mode: 'width', value: px } }).render();
    const png = opaque ? encodeRgbPng(img.pixels, img.width, img.height) : img.asPng();
    writeFileSync(join(outDir, file), png);
    console.log(`wrote assets/images/${file} (${px}x${px})`);
  }
}
