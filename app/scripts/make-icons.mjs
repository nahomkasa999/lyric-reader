// Generates PWA icons with zero dependencies (node:zlib for PNG encoding).
// Motif: "lyrics bars" — five vertical bars in the primary indigo on pure
// black, echoing the reader screen. Rounded square, 512px and 192px,
// plus a maskable variant with safe-zone padding.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(root, { recursive: true });

// Primary indigo from the design system: oklch(0.46 0.22 266) -> sRGB
const PRIMARY = [139, 183, 248];
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function roundedAlpha(x, y, size, radius) {
  const corners = [
    [radius, radius],
    [size - radius, radius],
    [radius, size - radius],
    [size - radius, size - radius],
  ];
  for (const [cx, cy] of corners) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > radius * radius) {
      // outside the rounded corner arc only if beyond the straight edges
      if ((x < radius || x > size - radius) && (y < radius || y > size - radius))
        return 0;
    }
  }
  return 255;
}

function makeIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.225;
  // Bars: 5 vertical bars, heights vary, centered. In maskable mode keep
  // everything inside the central 66% (safe zone).
  const margin = maskable ? size * 0.17 : size * 0.22;
  const area = size - margin * 2;
  const barCount = 5;
  const gap = area * 0.14;
  const barW = (area - gap * (barCount - 1)) / barCount;
  const heights = [0.42, 0.72, 1.0, 0.62, 0.34];
  const bars = heights.map((h, i) => {
    const bx = margin + i * (barW + gap);
    const bh = area * 0.62 * h + area * 0.08;
    return { x0: bx, x1: bx + barW, y0: size / 2 - bh / 2, y1: size / 2 + bh / 2 };
  });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = roundedAlpha(x + 0.5, y + 0.5, size, radius);
      let r = BLACK[0], g = BLACK[1], b = BLACK[2];
      for (const bar of bars) {
        if (x + 0.5 >= bar.x0 && x + 0.5 <= bar.x1 && y + 0.5 >= bar.y0 && y + 0.5 <= bar.y1) {
          [r, g, b] = PRIMARY;
          break;
        }
      }
      const o = (y * size + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    px.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

writeFileSync(join(root, "icon-512.png"), makeIcon(512));
writeFileSync(join(root, "icon-192.png"), makeIcon(192));
writeFileSync(join(root, "icon-maskable-512.png"), makeIcon(512, { maskable: true }));
console.log("icons written to", root);
