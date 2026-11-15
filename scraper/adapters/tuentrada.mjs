import { ubicar } from '../region.mjs';
import * as cheerio from 'cheerio';
// TuEntrada (tuentrada.com): ticketera del Teatro Gran Rex, el Colón y otras salas.
// La portada (Next.js) trae en su "flight data" un objeto por evento:
// {"id":…,"model":"event","slug":"…","name":"…","venue":"…","imageMainNew":{"src":…},"dateRange":"12-11-2026 21:00 hs"}
// TuEntrada vende en todo el país, así que se filtra por sala (venueInclude).

export function flightText(html) {
  const parts = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { parts.push(JSON.parse(m[1])); } catch { /* fragmento raro */ }
  }
  return parts.join('');
}

function objectsAt(text, marker) {
  const out = [];
  let i = text.indexOf(marker);
  while (i >= 0) {
    let depth = 0, j = i, inStr = false;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    try { out.push(JSON.parse(text.slice(i, j + 1))); } catch { /* incompleto */ }
    i = text.indexOf(marker, j);
  }
  return out;
}

export function parseDateRange(s) {
  const t = String(s || '');
  const m = t.match(/(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return {};
  const start = `${m[3]}-${m[2]}-${m[1]}T${m[4] ? m[4].padStart(2, '0') : '00'}:${m[5] || '00'}:00-03:00`;
  const e = t.match(/al\s+(\d{2})-(\d{2})-(\d{4})/);
  return { start, end: e ? `${e[3]}-${e[2]}-${e[1]}T23:59:00-03:00` : null };
}

export function parseTuEntrada(html, baseUrl, opts = {}) {
  const include = opts.venueInclude ? new RegExp(opts.venueInclude, 'i') : null;
  const seen = new Set();
  const out = [];
  const venues = new Map();
  for (const e of objectsAt(flightText(html), '{"id":')) {
    if (e.model !== 'event' || !e.slug || seen.has(e.slug)) continue;
    seen.add(e.slug);
    venues.set(e.venue, (venues.get(e.venue) || 0) + 1);
    if (include && !include.test(e.venue || '')) continue;
    if (/^tour$/i.test(e.venue || '')) continue;
    const { start, end } = parseDateRange(e.dateRange);
    if (!start) continue;
    out.push({
      title: e.name,
      start,
      end,
      whenText: /^del\b/i.test(e.dateRange || '') ? e.dateRange : null,
      place: e.venue || null,
      image: e.imageMainNew?.src || null,
      url: new URL(e.slug, baseUrl).href,
      baseUrl,
    });
  }
  if (opts.logVenues) console.log('   salas de TuEntrada:', [...venues].map(([v, n]) => `${v} (${n})`).join(' · '));
  return out;
}

// Página de una sala: la web pide los eventos a /api/proxy/venue/list-events con
// {"venueId":27,"model":"venue","cursor":null} y pagina con un cursor.
export function eventsFromVenueApi(json, venue, baseUrl) {
  const list = json?.data?.events || [];
  const anulado = (e) => /cancel|suspend|reprogram/i.test(`${e.availability || ''} ${e.status || ''} ${e.label || ''} ${e.badge || ''}`)
    || /^(CANCELLED|CANCELED|SUSPENDED)$/i.test(e.status || '');
  return list.filter((e) => e.model === 'event' && e.slug && !anulado(e)).map((e) => {
    const { start, end } = parseDateRange(e.dateRange);
    return {
      title: e.name,
      start,
      end,
      whenText: [/^del\b/i.test(e.dateRange || '') ? e.dateRange : null, /agotad|[uú]ltimas/i.test(e.availability || '') ? e.availability : null].filter(Boolean).join(' · ') || null,
      place: venue.name,
      address: venue.address,
      image: e.imageMainNew?.src || null,
      url: new URL(e.slug, baseUrl).href,
      baseUrl,
    };
  }).filter((e) => e.start);
}

export async function tuentradaVenues(body, url, source, ctx) {
  const out = [];
  for (const venue of source.options?.venues || []) {
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const res = await ctx.post(new URL('/api/proxy/venue/list-events', url).href, { venueId: venue.id, model: 'venue', cursor });
      const json = JSON.parse(res);
      out.push(...eventsFromVenueApi(json, venue, url));
      const next = json?.data?.cursor ?? json?.data?.nextCursor ?? json?.data?.pagination?.nextCursor ?? null;
      if (!next || next === cursor || !(json?.data?.events || []).length) break;
      cursor = next;
    }
  }
  return out;
}

// Búsqueda por categoría (/busqueda?categoria=teatro): tarjetas con "Sala, Ciudad".
// Se pagina con &cursor=… (un JSON en base64 con _pointsToNextItems:true para "Siguiente").
export function parseTuEntradaSearch(html, baseUrl) {
  const $ = cheerio.load(html);
  const events = [];
  $('a[href]').each((_, a) => {
    const $a = $(a);
    if (!$a.find('h2').length || !$a.find('svg.lucide-calendar-days').length) return;
    const title = $a.find('h2').first().text().replace(/\s+/g, ' ').trim();
    const dateRange = $a.find('svg.lucide-calendar-days').first().parent().text().replace(/\s+/g, ' ').trim();
    const where = $a.find('svg.lucide-map-pin').first().parent().text().replace(/\s+/g, ' ').trim();
    const status = $a.find('span.rounded-full').first().text().trim();
    const i = where.lastIndexOf(',');
    events.push({
      slug: $a.attr('href'),
      title, dateRange, status,
      venue: i > 0 ? where.slice(0, i).trim() : where,
      city: i > 0 ? where.slice(i + 1).trim() : '',
      image: $a.find('img').first().attr('src') || null,
    });
  });
  let next = null;
  $('a[href*="cursor="]').each((_, a) => {
    const href = $(a).attr('href');
    const c = new URL(href, baseUrl).searchParams.get('cursor');
    try {
      if (JSON.parse(Buffer.from(c, 'base64').toString('utf8'))._pointsToNextItems) next = new URL(href, baseUrl).href;
    } catch { /* cursor raro */ }
  });
  return { events, next };
}

export async function tuentradaSearch(body, url, source, ctx) {
  const out = [];
  const seen = new Set();
  let pageUrl = url, html = body;
  for (let page = 0; page < (source.options?.maxPages ?? 15); page++) {
    const { events, next } = parseTuEntradaSearch(html, pageUrl);
    for (const e of events) {
      const u = ubicar({ ciudad: e.city }, { ambiguo: 'CABA' });
      if (seen.has(e.slug) || !u || /^tour$/i.test(e.venue) || /cancel|suspend/i.test(e.status)) continue;
      seen.add(e.slug);
      const { start, end } = parseDateRange(e.dateRange);
      if (!start) continue;
      out.push({
        title: e.title, start, end,
        whenText: [/^del\b/i.test(e.dateRange) ? e.dateRange : null, /agotad|[uú]ltimas/i.test(e.status) ? e.status : null].filter(Boolean).join(' · ') || null,
        place: e.venue, image: e.image, url: new URL(e.slug, url).href,
        category: source.options?.category, baseUrl: url,
        provincia: u.provincia, zona: u.zona, localidad: u.localidad,
      });
    }
    if (!next || !events.length) break;
    pageUrl = next;
    html = await ctx.fetch(next);
  }
  return out;
}
