// Normalización de eventos: fechas, categorías, precio, deduplicación.
import { createHash } from 'node:crypto';

export const TZ_OFFSET = '-03:00'; // Argentina no usa horario de verano

const MESES = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

const pad = (n) => String(n).padStart(2, '0');

export function clean(s) {
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

export function stripHtml(s) {
  return clean(String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}

/**
 * Convierte una fecha en texto a ISO 8601 con zona horaria.
 * Acepta ISO ("2026-11-08T20:00", con o sin zona), "08/11/2026 20:30",
 * "8 de noviembre 21 hs", "sáb 8 nov", etc. Si falta el año, usa el próximo
 * que deje la fecha en el futuro (o en los últimos 7 días).
 */
export function parseDate(input, now = new Date()) {
  const s = clean(input);
  if (!s) return null;

  // ISO completo o parcial
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    let [, y, mo, d, h, mi, se, tz] = m;
    mo = mo.padStart(2, '0'); d = d.padStart(2, '0');
    if (!h) return `${y}-${mo}-${d}T00:00:00${TZ_OFFSET}`;
    const zone = tz ? (tz === 'Z' ? 'Z' : tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')) : TZ_OFFSET;
    return toLocalIso(new Date(`${y}-${mo}-${d}T${h}:${mi}:${se || '00'}${zone}`));
  }

  const lower = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const time = extractTime(lower.replace(/([a-z])(\d)/g, '$1 $2'));

  // "Todos los lunes 20 hs" → el próximo lunes
  m = lower.match(/todos los (domingo|lunes|martes|miercoles|jueves|viernes|sabado)/);
  if (m) {
    const target = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(m[1]);
    const local = new Date(now.getTime() - 3 * 3600e3);
    const diff = (target - local.getUTCDay() + 7) % 7;
    const d = new Date(local.getTime() + diff * 864e5);
    return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), time, now);
  }

  // "8 de noviembre", "8 nov", "sabado 8 de nov. de 2026"
  m = [...lower.matchAll(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?(?:\s+(?:de\s+)?(\d{4}))?/g)].find((x) => MESES[x[2]]);
  if (m) {
    const r = build(m[3] ? +m[3] : null, MESES[m[2]], +m[1], time, now);
    if (r) return r;
  }

  // dd/mm/yyyy o dd/mm
  m = lower.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : null;
    if (y && y < 100) y += 2000;
    const r = build(y, mo, d, time, now);
    if (r) return r;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return toLocalIso(new Date(t));
  return null;
}

function extractTime(lower) {
  // "20:30", "20.30 hs", "21 hs", "21h"
  let m = lower.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hs?|horas)?\b/);
  if (m && !lower.slice(m.index - 1, m.index).match(/[\/\d]/)) return [+m[1], +m[2]];
  m = lower.match(/\b([01]?\d|2[0-3])\s*(?:hs|h|horas)\b/);
  if (m) return [+m[1], 0];
  return null;
}

function build(y, mo, d, time, now) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const [h, mi] = time || [0, 0];
  if (!y) {
    y = now.getFullYear();
    const candidate = new Date(`${y}-${pad(mo)}-${pad(d)}T00:00:00${TZ_OFFSET}`);
    if (candidate < new Date(now.getTime() - 7 * 864e5)) y += 1;
  }
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00${TZ_OFFSET}`;
}

/** Fecha en hora de Buenos Aires, formato ISO con -03:00 */
export function toLocalIso(date) {
  if (Number.isNaN(date.getTime())) return null;
  const local = new Date(date.getTime() - 3 * 3600e3);
  return local.toISOString().slice(0, 19) + TZ_OFFSET;
}

const CATEGORIAS = [
  ['Tango', /\btango|milonga/],
  ['Infantil', /\binfantil|ninos|ninas|chicos|familia|titeres|vacaciones de invierno/],
  ['Música', /\bmusica|recital|concierto|banda|orquesta|jazz|rock|dj\b|show en vivo|festival de musica|sinfonica|cumbia|trap|folklore|opera/],
  ['Teatro', /\bteatro|obra|comedia|stand ?up|impro|musical|danza|ballet|circo/],
  ['Cine', /\bcine|pelicula|proyeccion|documental|film/],
  ['Arte y muestras', /\bmuestra|exposicion|museo|galeria|arte|fotografia|instalacion/],
  ['Ferias', /\bferia|mercado|bazar|expo\b/],
  ['Gastronomía', /\bgastronom|cerveza|vino|degustacion|food|asado|cafe\b|cocina/],
  ['Deportes', /\bmaraton|carrera|deporte|futbol|basquet|running|bicicleteada|yoga|partido/],
  ['Talleres y charlas', /\btaller|charla|conferencia|curso|seminario|workshop|clase|presentacion de libro|congreso/],
  ['Fiestas', /\bfiesta|party|boliche|after/],
];

export function categorize(...texts) {
  const t = texts.join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [cat, re] of CATEGORIAS) if (re.test(t)) return cat;
  return 'Otros';
}

export function isFreeText(...texts) {
  const t = texts.join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\bgratis|gratuit|entrada libre|sin cargo|free\b/.test(t);
}

export function slug(s) {
  return clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Convierte un evento crudo de un adaptador al formato final. */
export function normalizeEvent(raw, source, now = new Date()) {
  const title = stripHtml(raw.title);
  const start = raw.start ? parseDate(raw.start, now) : null;
  if (!title || !start) return null;
  const end = raw.end ? parseDate(raw.end, now) : null;
  const description = stripHtml(raw.description).slice(0, 400);
  const price = clean(raw.price);
  const free = raw.free === true || price === '0' || /^0([.,]0+)?$/.test(price) || isFreeText(price, title);
  const category = raw.category || source.defaultCategory || categorize(title, description, raw.place);

  return {
    id: createHash('sha1').update(`${slug(title)}|${start.slice(0, 10)}`).digest('hex').slice(0, 12),
    title,
    start,
    end: end && end >= start ? end : null,
    whenText: clean(raw.whenText) || null,
    place: clean(raw.place) || null,
    address: clean(raw.address) || null,
    description: description || null,
    image: absolutize(raw.image, raw.baseUrl),
    url: absolutize(raw.url, raw.baseUrl) || raw.baseUrl,
    price: free ? 'Gratis' : (price ? formatPrice(price, raw.currency) : null),
    free,
    category,
    sources: [{ id: source.id, name: source.name, url: absolutize(raw.url, raw.baseUrl) || raw.baseUrl }],
  };
}

function formatPrice(p, currency) {
  if (/^\d+([.,]\d+)?$/.test(p)) {
    const n = Number(p.replace(',', '.'));
    const sym = !currency || currency === 'ARS' ? '$' : `${currency} `;
    return `${sym}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  }
  return p;
}

function absolutize(u, base) {
  if (!u) return null;
  try { return new URL(u, base).href; } catch { return null; }
}

/** Une eventos repetidos (mismo título y día) que vienen de varias fuentes. */
export function dedupe(events) {
  const map = new Map();
  for (const e of events) {
    const prev = map.get(e.id);
    if (!prev) { map.set(e.id, e); continue; }
    for (const s of e.sources) if (!prev.sources.some((p) => p.id === s.id)) prev.sources.push(s);
    for (const k of ['place', 'address', 'description', 'image', 'price', 'end']) prev[k] ??= e[k];
    prev.free ||= e.free;
    if (prev.category === 'Otros') prev.category = e.category;
  }
  return [...map.values()];
}
