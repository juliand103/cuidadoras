// Genera los íconos PNG de la pantalla de inicio a partir de icons/logo.svg:
//   node tools/make-icons.js
// Lee solo lo que usa el logo: un <rect> de fondo, un <path> relleno (M/L/C/Z)
// y un <path> de trazos con puntas redondeadas.
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '..', 'icons');
const svg = readFileSync(resolve(DIR, 'logo.svg'), 'utf8');

const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const [vx, vy, vw] = attr(svg.match(/<svg[^>]*>/)[0], 'viewBox').split(/\s+/).map(Number);
const bg = hex(attr(svg.match(/<rect[^>]*>/)[0], 'fill'));
const paths = [...svg.matchAll(/<path[^>]*>/g)].map((m) => m[0]);
const fillTag = paths.find((p) => attr(p, 'fill') !== 'none');
const strokeTag = paths.find((p) => attr(p, 'stroke'));
const fillColor = hex(attr(fillTag, 'fill'));
const strokeColor = hex(attr(strokeTag, 'stroke'));
const strokeWidth = Number(attr(strokeTag, 'stroke-width'));

// Convierte un "d" en polilíneas (las curvas se muestrean)
function polylines(d) {
  const toks = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);
  const out = [];
  let cur = null;
  let p = null;
  for (let i = 0; i < toks.length;) {
    const t = toks[i++];
    if (t === 'M') {
      p = [+toks[i++], +toks[i++]];
      cur = [p];
      out.push(cur);
    } else if (t === 'L') {
      p = [+toks[i++], +toks[i++]];
      cur.push(p);
    } else if (t === 'C') {
      const [a, b, c, e, f, g] = toks.slice(i, i + 6).map(Number);
      i += 6;
      for (let k = 1; k <= 12; k++) {
        const s = k / 12;
        const u = 1 - s;
        cur.push([
          u * u * u * p[0] + 3 * u * u * s * a + 3 * u * s * s * c + s * s * s * f,
          u * u * u * p[1] + 3 * u * u * s * b + 3 * u * s * s * e + s * s * s * g,
        ]);
      }
      p = [f, g];
    } else if (t === 'Z') {
      cur.push(cur[0]);
    }
  }
  return out;
}

function render(size) {
  const SS = 4;
  const N = size * SS;
  const k = vw / N; // unidades del logo por muestra
  const fill = new Uint8Array(N * N);
  const stroke = new Uint8Array(N * N);
  // Relleno por líneas de barrido (par-impar)
  const edges = [];
  for (const pl of polylines(attr(fillTag, 'd'))) {
    for (let i = 0; i + 1 < pl.length; i++) edges.push([pl[i], pl[i + 1]]);
  }
  for (let row = 0; row < N; row++) {
    const y = vy + (row + 0.5) * k;
    const xs = [];
    for (const [[x1, y1], [x2, y2]] of edges) {
      if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const c0 = Math.max(0, Math.ceil((xs[i] - vx) / k - 0.5));
      const c1 = Math.min(N - 1, Math.floor((xs[i + 1] - vx) / k - 0.5));
      for (let col = c0; col <= c1; col++) fill[row * N + col] = 1;
    }
  }
  // Trazos: cápsulas alrededor de cada segmento
  const r = strokeWidth / 2;
  for (const pl of polylines(attr(strokeTag, 'd'))) {
    for (let i = 0; i + 1 < pl.length; i++) {
      const [ax, ay] = pl[i];
      const [bx, by] = pl[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const cMin = Math.max(0, Math.floor((Math.min(ax, bx) - r - vx) / k));
      const cMax = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + r - vx) / k));
      const rMin = Math.max(0, Math.floor((Math.min(ay, by) - r - vy) / k));
      const rMax = Math.min(N - 1, Math.ceil((Math.max(ay, by) + r - vy) / k));
      for (let row = rMin; row <= rMax; row++) {
        const y = vy + (row + 0.5) * k;
        for (let col = cMin; col <= cMax; col++) {
          const x = vx + (col + 0.5) * k;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
          const ex = x - (ax + t * dx);
          const ey = y - (ay + t * dy);
          if (ex * ex + ey * ey <= r * r) stroke[row * N + col] = 1;
        }
      }
    }
  }
  // Promediar las muestras de cada píxel
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const idx = (py * SS + sy) * N + px * SS + sx;
          const c = stroke[idx] ? strokeColor : fill[idx] ? fillColor : bg;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let j = 0; j < 3; j++) raw[o + j] = Math.round(acc[j] / (SS * SS));
    }
  }
  return png(size, raw);
}

function png(size, raw) {
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
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

for (const size of [180, 192, 512]) {
  writeFileSync(resolve(DIR, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}
