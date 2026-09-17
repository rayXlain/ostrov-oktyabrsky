/* Сборка деплой-версии лендинга.
 *
 *   node build.mjs
 *
 * Берёт исходник «Остров Октябрьский.dc.html», выкидывает рантайм-обвязку
 * (x-dc / support.js), навешивает классы и хуки анимации, добавляет мету,
 * и складывает готовый статический сайт в dist/ — папку, которую можно
 * перетащить на app.netlify.com/drop.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(root, 'Остров Октябрьский.dc.html');
const SRC_DIR = path.join(root, 'src');
const ASSETS = path.join(root, 'assets');
const DIST = path.join(root, 'dist');

/* Домен. Поменяйте после того, как Netlify выдаст адрес (или подключите свой). */
const SITE_URL = 'https://rayxlain.github.io/ostrov-oktyabrsky';

const TITLE = 'Остров Октябрьский — как застраивается новый центр Калининграда';
const DESCRIPTION =
  'Десять объектов острова Октябрьский: филиалы Большого театра и Третьяковской галереи, ' +
  'образовательный кластер, стеклянная гостиница Snøhetta и башни на стилобате. ' +
  'Хронология 2019—2027, схема застройки, застройщики и источники.';

/* ── утилиты ───────────────────────────────────────────────────────────── */

const hash = (buf) => crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);

/** Размеры JPEG/PNG без зависимостей — чтобы проставить width/height и убрать сдвиги вёрстки. */
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let o = 2;
  while (o < b.length - 9) {
    if (b[o] !== 0xff) { o++; continue; }
    const marker = b[o + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)];
    }
    o += 2 + b.readUInt16BE(o + 2);
  }
  return null;
}

/** Минимальный PNG-энкодер: нужен ровно один раз — для apple-touch-icon. */
function writePng(file, size, draw) {
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x, y);
      const i = (y * size + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // truecolor
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* ── разметка ──────────────────────────────────────────────────────────── */

const source = fs.readFileSync(SRC, 'utf8');
let m = source.split('<x-dc>')[1].split('</x-dc>')[0].trim();

// рантайм-обвязка dc
m = m.replace(' onClick="{{ toggleLang }}"', '');

// опорные классы
m = m.replace('<header style=', '<header class="site-header" style=');
m = m.replace('<footer style=', '<footer class="site-footer" style=');
m = m.replace(/<a href="#(map|timeline|catalog|players)" style="color:#a9a7a1"/g,
  '<a href="#$1" class="nav-link"');
m = m.replace('<a href="#top" style="color:#a9a7a1" data-en="Back to top ↑">',
  '<a href="#top" class="back-to-top" style="color:#a9a7a1" data-en="Back to top ↑">');
m = m.replace(/<button id="langBtn" type="button" style="[^"]*"/,
  '<button id="langBtn" type="button" class="lang-btn" aria-label="Switch to English"');
m = m.replace(/(<a href="#obj-\d+" data-spy="obj-\d+") style="flex:0 0 auto;[^"]*"/g,
  '$1 class="rail-link"');

// хронология: лента + карточки
m = m.replace('<div style="display:flex;gap:1px;overflow-x:auto;scroll-snap-type:x mandatory;',
  '<div class="timeline-scroller" role="region" aria-label="Хронология острова, прокрутка по горизонтали" tabindex="0" style="display:flex;gap:1px;overflow-x:auto;scroll-snap-type:x mandatory;');
m = m.replace(/<div style="scroll-snap-align:start;/g,
  '<div class="tl-card" data-reveal-x style="scroll-snap-align:start;');

// карточки застройщиков
m = m.replace(/<div style="background:#f3f1ec;padding:clamp\(20px,2\.4vw,32px\);box-shadow:0 0 0 1px #d8d3c8"/g,
  '<div class="player-card" data-reveal style="background:#f3f1ec;padding:clamp(20px,2.4vw,32px);box-shadow:0 0 0 1px #d8d3c8"');
m = m.replace('<div style="background:#e6e2d9;padding:clamp(20px,2.4vw,32px);box-shadow:0 0 0 1px #d8d3c8;',
  '<div class="player-card" data-reveal style="background:#e6e2d9;padding:clamp(20px,2.4vw,32px);box-shadow:0 0 0 1px #d8d3c8;');

// источники
m = m.replace(/<a href="(https:\/\/kgd\.ru[^"]*)"/g, '<a class="source-link" href="$1"');

// обёртки изображений — «штора» и приближение
m = m.replace(/<div style="overflow:hidden;aspect-ratio:/g, '<div data-reveal-img style="overflow:hidden;aspect-ratio:');
m = m.replace(/<div data-parallax="0\.05" style="overflow:hidden;/g, '<div data-parallax="0.05" data-reveal-img style="overflow:hidden;');
m = m.replace('<div data-parallax="0.1" style="position:relative;overflow:hidden;height:clamp(320px,62vh,720px)',
  '<div data-parallax="0.1" data-reveal-img style="position:relative;overflow:hidden;height:clamp(320px,62vh,720px)');

// герой: медленный наезд отдельным слоем, чтобы не спорить с параллаксом
m = m.replace(/<div data-parallax="0\.14"([^>]*)>\s*(<img[^>]*>)\s*<\/div>/,
  '<div class="hero-media" data-parallax="0.14"$1><div class="kb">$2</div></div>');
m = m.replace(';animation:heroRise 1.1s cubic-bezier(.16,.84,.3,1) both"', '" class="hero-body"');

// цифры, которые «набегают»
m = m.replace(/<div style="font-family:'Unbounded',sans-serif;font-weight:300;font-size:clamp\(30px,3\.4vw,52px\);line-height:1"/g,
  '<div data-count style="font-family:\'Unbounded\',sans-serif;font-weight:300;font-size:clamp(30px,3.4vw,52px);line-height:1"');
m = m.replace(/<div style="font-family:'Unbounded',sans-serif;font-weight:300;font-size:clamp\(24px,2\.4vw,38px\);line-height:1"/g,
  '<div data-count style="font-family:\'Unbounded\',sans-serif;font-weight:300;font-size:clamp(24px,2.4vw,38px);line-height:1"');
m = m.replace(/<div style="padding:18px 0 0;border-top:1px solid #d8d3c8">/g,
  '<div data-reveal style="padding:18px 0 0;border-top:1px solid #d8d3c8">');

// текстовые блоки выходят при скролле
m = m.replace(/<(h2|h3|p|figure|blockquote|dl|cite)(\s|>)/g, '<$1 data-reveal$2');

// картинки: размеры, ленивая загрузка, приоритет для первого экрана
const dims = {};
for (const f of fs.readdirSync(ASSETS)) dims[f] = imageSize(path.join(ASSETS, f));
let firstImage = true;
let missingDims = 0;
m = m.replace(/<img ([^>]*?)\s*\/>/g, (full, attrs) => {
  const src = (/src="([^"]+)"/.exec(attrs) || [])[1] || '';
  const d = dims[path.basename(src)];
  if (!d) missingDims++;
  const size = d ? ` width="${d[0]}" height="${d[1]}"` : '';
  const load = firstImage
    ? ' fetchpriority="high" decoding="async"'
    : ' loading="lazy" decoding="async"';
  firstImage = false;
  return `<img ${attrs}${size}${load} />`;
});

// подсказка «листайте» в герое
const heroEnd = m.indexOf('</section>');
m = m.slice(0, heroEnd) +
  '  <div class="scroll-hint" aria-hidden="true"><span data-en="Scroll">Листайте</span></div>\n' +
  m.slice(heroEnd);

// пасхалка — в самом низу, после reveal-прохода (иначе спрячется вместе с остальными)
m = m.replace('</footer>',
  `  <div class="egg" id="egg">
    <button class="egg-dot" id="eggDot" type="button" aria-label="Пасхалка">·</button>
    <p class="egg-text" aria-hidden="true">Аркаша лох, объелся блох</p>
  </div>
</footer>`);

/* проверки, чтобы правки исходника не ломали сборку молча */
const warn = [];
if (m.includes('{{')) warn.push('в разметке остались dc-подстановки {{ ... }}');
if (m.includes('data-parallax') && !m.includes('class="hero-media"')) warn.push('не найден герой-параллакс');
if (!m.includes('class="rail-link"')) warn.push('не размечена рейка объектов');
if (!m.includes('data-reveal-img')) warn.push('не размечены обёртки изображений');
if (missingDims) warn.push(`не удалось определить размеры у ${missingDims} изображений`);

/* ── файлы ─────────────────────────────────────────────────────────────── */

// чистим содержимое, а не саму папку: её может держать открытой локальный сервер
if (fs.existsSync(DIST)) {
  for (const f of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, f), { recursive: true, force: true });
}
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

// в деплой едут только те картинки, которые реально есть на странице
const used = new Set([...m.matchAll(/(?:src|href)="assets\/([^"]+)"/g)].map((x) => x[1]));
const skipped = [];
for (const f of fs.readdirSync(ASSETS)) {
  if (used.has(f)) fs.copyFileSync(path.join(ASSETS, f), path.join(DIST, 'assets', f));
  else skipped.push(f);
}

const css = fs.readFileSync(path.join(SRC_DIR, 'styles.css'));
const js = fs.readFileSync(path.join(SRC_DIR, 'app.js'));
fs.writeFileSync(path.join(DIST, 'styles.css'), css);
fs.writeFileSync(path.join(DIST, 'app.js'), js);
const cssV = hash(css);
const jsV = hash(js);

// карточка для мессенджеров и соцсетей — берём уже лежащий в assets кадр,
// чтобы не возить в деплой второй мегабайт того же снимка
const OG_IMAGE = '/assets/bolshoy-02.jpg';

// иконки
fs.copyFileSync(path.join(SRC_DIR, 'favicon.svg'), path.join(DIST, 'favicon.svg'));
writePng(path.join(DIST, 'apple-touch-icon.png'), 180, (x, y) => {
  const d = Math.hypot(x - 89.5, y - 89.5);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ring = clamp(Math.min(d - 54, 62 - d) + 0.5);   // кольцо, со сглаженным краем
  const dot = clamp(12 - d + 0.5);                      // точка в центре
  const bg = [11, 12, 14], ac = [209, 154, 92], paper = [243, 241, 236];
  return bg.map((c, i) =>
    Math.round(c * (1 - ring - dot) + ac[i] * ring + paper[i] * dot));
});

const today = new Date().toISOString().slice(0, 10);

const head = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}" />
<meta name="theme-color" content="#0b0c0e" />
<meta name="color-scheme" content="dark" />
<link rel="canonical" href="${SITE_URL}/" />

<meta property="og:type" content="article" />
<meta property="og:locale" content="ru_RU" />
<meta property="og:site_name" content="Остров Октябрьский" />
<meta property="og:title" content="${TITLE}" />
<meta property="og:description" content="${DESCRIPTION}" />
<meta property="og:url" content="${SITE_URL}/" />
<meta property="og:image" content="${SITE_URL}${OG_IMAGE}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="800" />
<meta property="og:image:alt" content="Стройплощадка филиала Большого театра на острове Октябрьский" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${TITLE}" />
<meta name="twitter:description" content="${DESCRIPTION}" />
<meta name="twitter:image" content="${SITE_URL}${OG_IMAGE}" />

<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="crossorigin" />
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@200;300;400;500;600&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="preload" as="image" href="assets/bolshoy-01.jpg" fetchpriority="high" />
<link rel="stylesheet" href="styles.css?v=${cssV}" />

<script>
  document.documentElement.className = 'js';
  // если app.js не загрузится, контент всё равно покажется
  window.__revealSafety = setTimeout(function () {
    document.documentElement.classList.add('reveal-all');
  }, 2500);
</script>
<script src="app.js?v=${jsV}" defer></script>

<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: TITLE,
  description: DESCRIPTION,
  inLanguage: 'ru',
  url: SITE_URL + '/',
  about: {
    '@type': 'Place',
    name: 'Остров Октябрьский',
    address: { '@type': 'PostalAddress', addressLocality: 'Калининград', addressCountry: 'RU' },
  },
  primaryImageOfPage: { '@type': 'ImageObject', url: SITE_URL + OG_IMAGE },
  dateModified: today,
}, null, 2)}
</script>
</head>
<body>
`;

fs.writeFileSync(path.join(DIST, 'index.html'), head + m + '\n</body>\n</html>\n');

fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);

fs.copyFileSync(path.join(SRC_DIR, 'netlify.toml'), path.join(DIST, 'netlify.toml'));
fs.copyFileSync(path.join(SRC_DIR, '_headers'), path.join(DIST, '_headers'));
// GitHub Pages иначе прогоняет папку через Jekyll и прячет файлы на _
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.copyFileSync(path.join(SRC_DIR, '404.html'), path.join(DIST, '404.html'));

/* ── отчёт ─────────────────────────────────────────────────────────────── */

const size = (p) =>
  fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).reduce((s, f) => s + size(path.join(p, f)), 0)
    : fs.statSync(p).size;

console.log('dist/ собран:');
for (const f of fs.readdirSync(DIST)) {
  const p = path.join(DIST, f);
  const kb = (size(p) / 1024).toFixed(0).padStart(6);
  console.log(`  ${kb} KB  ${f}${fs.statSync(p).isDirectory() ? '/' : ''}`);
}
console.log(`  всего: ${(size(DIST) / 1024 / 1024).toFixed(2)} MB`);
if (skipped.length) console.log(`  (не попали в сборку, их нет на странице: ${skipped.join(', ')})`);
if (warn.length) {
  console.log('\nвнимание:');
  warn.forEach((w) => console.log('  ! ' + w));
}
