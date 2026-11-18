// Agenda Cultural Federal de la Secretaría de Cultura de la Nación (cultura.gob.ar).
// Se consulta día por día (/agenda/filtro/?fecha=AAAAMMDD&pagina=N). Las tarjetas
// vienen ordenadas por fecha de cierre y al final los "Evento permanente"
// (museos abiertos todo el año), que se descartan.
// - Actividades de un día o de pocos días ("Miércoles 18…", "Del 25 al 26…"):
//   una función por cada día en que aparecen; el horario y el lugar salen de la
//   página de la actividad ("¿Cuándo?" / "¿Dónde?").
// - Muestras y ciclos largos ("Hasta el 22 de noviembre"): un solo evento con fecha de cierre.
import * as cheerio from 'cheerio';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const CATS = [
  [/m[uú]sica/i, 'Música'], [/teatro|danza/i, 'Teatro'], [/cine/i, 'Cine'],
  [/arte|muestra|museo/i, 'Arte y muestras'], [/feria/i, 'Ferias'],
];

export function fechaHasta(texto) {
  const m = clean(texto).match(new RegExp(`(\\d{1,2}) de (${MESES.join('|')}) de (\\d{4})`, 'i'));
  if (!m) return null;
  return `${m[3]}-${String(MESES.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function parseCulturaDia(html, baseUrl) {
  const $ = cheerio.load(html);
  return $('.post.caja').map((_, el) => {
    const $el = $(el);
    const a = $el.find('.titulo a, h2 a, h3 a').first();
    const href = a.attr('href') || $el.find('a.goto').attr('href');
    const title = clean(a.text()) || clean($el.find('.sr-only').first().text());
    if (!href || !title) return null;
    const cuando = clean($el.find('small').first().text());
    const tags = $el.find('.meta .tag').map((_, t) => clean($(t).text())).get();
    const geo = clean($el.find('.flag.geo').text()) || clean($el.find('.geo').text());
    return {
      title,
      url: new URL(href, baseUrl).href,
      cuando,
      tipo: /^evento permanente/i.test(cuando) ? 'permanente' : /^hasta/i.test(cuando) ? 'hasta' : 'dias',
      tags,
      geo,
      bajada: clean($el.find('.bajada').first().text()),
      image: $el.find('.image-wrapper').attr('data-original'),
    };
  }).get().filter(Boolean);
}

/** De la página de la actividad: hora (de "¿Cuándo?"), lugar ("¿Dónde?") y si es gratis. */
export function parseCulturaDetalle(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, footer').remove();
  // Texto por renglones: cada bloque (p, div, h, li, br) en su línea
  const cuerpo = ($('article').html() || $('body').html() || '')
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|section|header)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const lineas = cheerio.load(`<pre>${cuerpo}</pre>`)('pre').text().split('\n').map(clean).filter(Boolean);
  const txt = lineas.join(' ');
  // El dato puede estar en la misma línea que la pregunta o en la siguiente
  const tramo = (k) => {
    const i = lineas.findIndex((l) => l.startsWith(`¿${k}?`));
    if (i < 0) return '';
    const resto = clean(lineas[i].slice(k.length + 2));
    return resto || (lineas[i + 1] && !lineas[i + 1].startsWith('¿') ? lineas[i + 1] : '');
  };
  const cuando = clean(tramo('Cuándo'));
  const donde = clean(tramo('Dónde'));
  const h = cuando.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:h\b|hs\b|horas)/i);
  const hora = h && Number(h[1]) < 24 ? `${h[1].padStart(2, '0')}:${h[2] || '00'}` : null;
  return {
    hora,
    cuando,
    donde: donde.slice(0, 160) || null,
    gratis: /gratuit|entrada libre|sin cargo|libre y gratuit/i.test(txt),
    image: $('meta[property="og:image"]').attr('content'),
  };
}

function aRaw(it, extra) {
  const cat = CATS.find(([re]) => re.test(it.tags.join(' ')));
  const lugar = extra.donde || null;
  // "Riobamba 985, CABA" / "Congreso 141, San Miguel de Tucuman, Tucumán": la última parte es la provincia
  const partes = (lugar || '').split(',').map(clean).filter(Boolean);
  return {
    title: it.title,
    description: it.bajada,
    image: extra.image || it.image,
    url: it.url,
    baseUrl: it.url,
    category: cat ? cat[1] : undefined,
    place: partes.length > 1 ? partes.slice(0, -1).join(', ') : lugar,
    region: it.geo || partes.at(-1) || undefined,
    ciudad: partes.length > 2 ? partes.at(-2) : undefined,
    free: extra.gratis || undefined,
    // La etiqueta distingue "CABA" de "Buenos Aires" (provincia): sin ciudad, no adivinar CABA
    ...(it.geo === 'Buenos Aires' && partes.length < 3 ? { provincia: 'Buenos Aires', zona: null } : {}),
  };
}

export async function cultura(body, url, source, ctx, now = new Date()) {
  const dias = source.options?.dias ?? 45;
  const maxPag = source.options?.maxPaginas ?? 12;
  const base = new URL('/agenda/filtro/', url).href;
  const vistos = new Map(); // url → { it, dias:Set }
  for (let i = 0; i < dias; i++) {
    const key = new Date(now.getTime() - 3 * 3600e3 + i * 864e5).toISOString().slice(0, 10);
    const enDia = new Set();
    for (let p = 1; p <= maxPag; p++) {
      let items;
      try {
        items = parseCulturaDia(await ctx.fetch(`${base}?fecha=${key.replace(/-/g, '')}&pagina=${p}`), base);
      } catch (err) { ctx.warn(`${key} p${p}: ${err.message}`); break; }
      const nuevos = items.filter((it) => !enDia.has(it.url));
      if (!nuevos.length) break; // pasada la última página repite la anterior
      for (const it of nuevos) {
        enDia.add(it.url);
        if (it.tipo === 'permanente') continue;
        if (!vistos.has(it.url)) vistos.set(it.url, { it, dias: new Set() });
        vistos.get(it.url).dias.add(key);
      }
      if (nuevos.every((it) => it.tipo === 'permanente')) break; // ya solo quedan los permanentes
    }
  }

  const out = [];
  for (const { it, dias: ds } of vistos.values()) {
    const diasOrd = [...ds].sort();
    if (it.tipo === 'hasta') {
      const hasta = fechaHasta(it.cuando);
      out.push({ ...aRaw(it, {}), start: `${diasOrd[0]}T00:00:00-03:00`, end: hasta ? `${hasta}T23:59:00-03:00` : undefined, whenText: it.cuando });
      continue;
    }
    let det = {};
    try { det = parseCulturaDetalle(await ctx.fetch(it.url)); } catch (err) { ctx.warn(`${it.url}: ${err.message}`); }
    const raw = aRaw(it, det);
    for (const d of diasOrd) out.push({ ...raw, start: `${d}T${det.hora || '00:00'}:00-03:00`, whenText: det.cuando || it.cuando });
  }
  return out;
}
