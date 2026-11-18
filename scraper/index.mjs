// Junta eventos de todas las fuentes de sources.json y escribe site/data/events.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseAuto, parseJsonLd, parseMicrodata } from './adapters/jsonld.mjs';
import { parseHtml } from './adapters/html.mjs';
import { parseIcal } from './adapters/ical.mjs';
import { parseAlternativa } from './adapters/alternativa.mjs';
import { parseTurismoBA } from './adapters/turismoba.mjs';
import { follow } from './adapters/follow.mjs';
import { ticketek } from './adapters/ticketek.mjs';
import { complejo } from './adapters/complejo.mjs';
import { parseArtMedia } from './adapters/artmedia.mjs';
import { parseNiceto } from './adapters/niceto.mjs';
import { plateanet } from './adapters/plateanet.mjs';
import { parseFestivalear } from './adapters/festivalear.mjs';
import { parseEnigma } from './adapters/enigma.mjs';
import { parseBebop, parseLivepass } from './adapters/jazz.mjs';
import { parseTuEntrada, tuentradaVenues, tuentradaSearch } from './adapters/tuentrada.mjs';
import { coolco } from './adapters/coolco.mjs';
import { dfent } from './adapters/dfent.mjs';
import { cultura } from './adapters/cultura.mjs';
import { rendered, closeBrowser, browserFetch } from './adapters/rendered.mjs';
import { normalizeEvent, dedupe, agrupar } from './normalize.mjs';
import { ubicar } from './region.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// --local: corre solo las fuentes marcadas "runner": "local" (sitios que bloquean
// conexiones desde fuera de Argentina) y guarda en site/data/local.json.
// Lo ejecuta la tarea "Actualizar fuentes locales" en una compu en Argentina.
const LOCAL = process.argv.includes('--local');
const OUT = path.join(ROOT, 'site', 'data', LOCAL ? 'local.json' : 'events.json');
const LOCAL_OUT = path.join(ROOT, 'site', 'data', 'local.json');
// Se muestran los eventos hasta esta fecha (inclusive)
export const HASTA = process.env.HASTA || '2027-12-31T23:59:59-03:00';
const USER_AGENT = process.env.USER_AGENT ||
  'AgendaCABA/1.0 (agregador de eventos sin fines de lucro; enlaza siempre a la fuente)';

async function fetchText(url, tries = 2, extraHeaders = {}) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-AR,es;q=0.9', ...extraHeaders },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// Tipos que necesitan pedir más páginas además de la inicial
const MULTI = { follow, ticketek, complejo, 'tuentrada-salas': tuentradaVenues, 'tuentrada-busqueda': tuentradaSearch, plateanet, coolco, dfent, cultura };

async function runAdapter(source, body, url, ctx) {
  if (MULTI[source.type]) return MULTI[source.type](body, url, source, ctx);
  switch (source.type) {
    case 'artmedia': return parseArtMedia(body, url);
    case 'niceto': return parseNiceto(body, url);
    case 'festivalear': return parseFestivalear(body, url);
    case 'enigma': return parseEnigma(body, url, source.options);
    case 'bebop': return parseBebop(body, url);
    case 'livepass': return parseLivepass(body, url, source.options);
    case 'tuentrada': return parseTuEntrada(body, url, source.options);
    case 'auto': return parseAuto(body, url);
    case 'jsonld': return parseJsonLd(body, url);
    case 'microdata': return parseMicrodata(body, url);
    case 'html': return parseHtml(body, url, source.selectors);
    case 'ical': return parseIcal(body, url);
    case 'alternativa': return parseAlternativa(body, url, source.options);
    case 'turismo-ba': return parseTurismoBA(body, url);
    default: throw new Error(`Tipo de fuente desconocido: ${source.type}`);
  }
}

async function scrapeSource(source, now) {
  const raw = [];
  const errors = [];
  const warnings = [];
  const delay = source.delayMs ?? 800;
  const ctx = {
    fetch: async (u) => {
      await new Promise((r) => setTimeout(r, delay));
      return source.browser ? browserFetch(u, 'script[type="application/ld+json"]') : fetchText(u, 2, source.headers);
    },
    warn: (msg) => warnings.push(msg),
    post: async (u, data) => {
      await new Promise((r) => setTimeout(r, delay));
      const res = await fetch(u, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  };
  for (const url of source.urls) {
    try {
      if (source.type === 'rendered') {
        raw.push(...await rendered(null, url, source));
        continue;
      }
      const body = source.browser ? await browserFetch(url) : await fetchText(url, 2, source.headers);
      try {
        raw.push(...await runAdapter(source, body, url, ctx));
      } catch (err) {
        throw new Error(`${err.message} (respuesta de ${body.length} caracteres: ${JSON.stringify(body.slice(0, 120))})`);
      }
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // ser amables con el sitio
  }
  if (warnings.length) {
    errors.push(...warnings.slice(0, 5));
    if (warnings.length > 5) errors.push(`… y ${warnings.length - 5} avisos más`);
  }
  // Un adaptador marca zona 'fuera' cuando el evento es del exterior (o no se puede ubicar)
  const enZona = raw.filter((r) => r.zona !== 'fuera' && !r.fuera);
  raw.length = 0; raw.push(...enZona);
  for (const r of raw) {
    // Datos estándar con ciudad/región (JSON-LD): ubicar con eso
    if (r.provincia === undefined && r.zona === undefined && (r.ciudad || r.region)) {
      const u = ubicar({ ciudad: r.ciudad, provincia: r.region });
      if (u) Object.assign(r, { provincia: u.provincia, zona: u.zona, localidad: u.localidad });
      // Localidad desconocida en una fuente regional (Eden → Córdoba)
      if (u && !u.provincia && source.provinciaPorDefecto) r.provincia = source.provinciaPorDefecto;
    }
    // Sin ubicación propia: la de la fuente (por defecto, una sala de CABA)
    if (r.provincia === undefined && r.zona === undefined) {
      // "provincia": null en la fuente = sin ubicación conocida (mejor vacío que equivocado)
      r.provincia = source.provincia !== undefined ? source.provincia : 'CABA';
      r.zona = source.zona !== undefined ? source.zona : (r.provincia === 'CABA' ? 'CABA' : null);
    }
    // Algunos sitios (Jazz Voyeur) marcan la hora local como si fuera UTC: se ignora la zona
    if (source.localTime && typeof r.start === 'string') r.start = r.start.replace(/(Z|[+-]\d{1,2}:?\d{2})$/, '');
    if (source.localTime && typeof r.end === 'string') r.end = r.end.replace(/(Z|[+-]\d{1,2}:?\d{2})$/, '');
    r.place ||= source.defaultPlace;
    r.address ||= source.defaultAddress;
    if (source.placePrefix && r.place && !r.place.includes(source.placePrefix)) r.place = `${source.placePrefix} · ${r.place}`;
    else if (source.placePrefix && !r.place) r.place = source.placePrefix;
  }
  const funciones = raw.map((r) => normalizeEvent(r, source, now)).filter((e) => e && inWindow(e, now));
  const events = agrupar(funciones);
  return { events, errors, ok: events.length > 0, funciones: funciones.length };
}

function inWindow(e, now) {
  const start = new Date(e.start);
  const last = e.fechas?.length ? new Date(e.fechas[e.fechas.length - 1]) : start;
  const end = e.end ? new Date(Math.max(new Date(e.end), last)) : new Date(last.getTime() + 4 * 3600e3);
  return end >= now && start <= new Date(HASTA);
}

async function loadPrevious() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); } catch { return null; }
}

async function main() {
  const now = new Date();
  const sources = JSON.parse(await readFile(path.join(ROOT, 'sources.json'), 'utf8'))
    .filter((s) => s.enabled !== false)
    .filter((s) => (s.runner === 'local') === LOCAL);
  const previous = await loadPrevious();

  const all = [];
  const report = [];
  for (const source of sources) {
    process.stdout.write(`→ ${source.name}… `);
    const { events, errors, ok, funciones } = await scrapeSource(source, now);
    let kept = events;
    let note = null;
    // Si una fuente falla o no devuelve nada, conservamos sus eventos anteriores
    // que todavía no pasaron, para que la página no quede vacía.
    if (!events.length && previous?.events) {
      kept = previous.events.filter((e) => e.sources.some((s) => s.id === source.id));
      if (kept.length) note = 'sin datos nuevos: se muestran los de la última actualización';
    }
    all.push(...kept.filter((e) => inWindow(e, now)));
    report.push({ id: source.id, name: source.name, count: events.length, ok: ok && events.length > 0, note, errors });
    console.log(`${events.length} eventos (${funciones || 0} funciones)${errors.length ? ` (${errors.length} error/es)` : ''}`);
    for (const e of errors) console.log(`   ⚠ ${e}`);
  }

  await closeBrowser();
  // Eventos que trajo la compu local (si la tarea corrió alguna vez)
  if (!LOCAL) {
    try {
      const local = JSON.parse(await readFile(LOCAL_OUT, 'utf8'));
      const vigentes = (local.events || []).filter((e) => inWindow(e, now));
      all.push(...vigentes);
      for (const s of local.sources || []) report.push({ ...s, note: s.note || `actualizado desde la compu local el ${new Date(local.generatedAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` });
      console.log(`→ Fuentes locales (local.json): ${vigentes.length} eventos vigentes`);
    } catch { /* todavía no corrió la tarea local */ }
  }
  const events = dedupe(all.filter((e) => inWindow(e, now)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

  if (!events.length && previous?.events?.length) {
    console.log('Ninguna fuente devolvió eventos: se mantiene el archivo anterior.');
    process.exit(0);
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  // Fechas ya pasadas fuera de la lista de funciones
  const hoy = new Date(now.getTime() - 4 * 3600e3).toISOString();
  for (const e of events) if (e.fechas) e.fechas = e.fechas.filter((f) => new Date(f).toISOString() >= hoy);
  await writeFile(OUT, JSON.stringify({ generatedAt: now.toISOString(), hasta: HASTA, sources: report, events }));
  console.log(`\n✓ ${events.length} eventos guardados en site/data/${path.basename(OUT)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
