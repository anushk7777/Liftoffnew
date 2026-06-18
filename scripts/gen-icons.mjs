// Rasterize public/icon.svg into the PNG sizes a high-quality installable PWA
// needs (Android maskable + iOS apple-touch). Run: node scripts/gen-icons.mjs
// Re-run whenever icon.svg changes; the generated PNGs are committed.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const src = join(pub, 'icon.svg');
const BG = '#0b0a16'; // matches manifest background_color / theme_color

async function square(size, out) {
  await sharp(src, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toFile(join(pub, out));
  console.log('  ✓', out);
}

// Maskable: shrink the art to ~80% on a solid background so Android's safe-zone
// mask never clips it.
async function maskable(size, out) {
  const inner = Math.round(size * 0.8);
  const art = await sharp(src, { density: 384 }).resize(inner, inner, { fit: 'contain' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(join(pub, out));
  console.log('  ✓', out);
}

console.log('Generating PWA icons from icon.svg…');
await square(192, 'pwa-192.png');
await square(512, 'pwa-512.png');
await square(180, 'apple-touch-icon.png');
await maskable(512, 'pwa-maskable-512.png');
console.log('Done.');
