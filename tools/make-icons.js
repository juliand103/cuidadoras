// Genera los íconos de la app (calendario con tilde, blanco sobre verde): node tools/make-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '..', 'icons');
const BG = [0x0b, 0x6b, 0x5e];

// Distancias con signo (diseño en una grilla de 512)
function sdRoundBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdSegment(x, y, ax, ay, bx, by) {
  const px = x - ax;
  const py = y - ay;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * t, py - dy * t);
}
function ink(x, y) {
  const body = Math.abs(sdRoundBox(x, y, 256, 286, 150, 130, 30)) - 14;
  const bar = sdSegment(x, y, 106, 212, 406, 212) - 14;
  const ring1 = sdSegment(x, y, 196, 112, 196, 168) - 15;
  const ring2 = sdSegment(x, y, 316, 112, 316, 168) - 15;
  const check = Math.min(sdSegment(x, y, 186, 300, 236, 350), sdSegment(x, y, 236, 350, 330, 256)) - 17;
  return Math.min(body, bar, ring1, ring2, check) <= 0;
}

function png(size) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 512;
          const y = ((py + (sy + 0.5) / SS) / size) * 512;
          if (ink(x, y)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k] * (1 - a) + 255 * a);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

for (const size of [180, 192, 512]) {
  writeFileSync(resolve(OUT, `icon-${size}.png`), png(size));
  console.log(`icons/icon-${size}.png`);
}
