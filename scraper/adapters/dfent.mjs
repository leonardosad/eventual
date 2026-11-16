// DF Entertainment (productora de grandes recitales: River, Movistar Arena,
// Lollapalooza…). La lista /shows enlaza a una página por show con título,
// fechas en texto ("23, 25 y 27 de Marzo", sin año) y el estadio.
import * as cheerio from 'cheerio';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Algunos estadios fuera de la Ciudad, para ubicarlos bien.
const SEDES = [
  [/hip[oó]dromo de san isidro/i, 'San Isidro'],
  [/estadio [uú]nico.*la plata|estadio diego armando maradona/i, 'La Plata'],
  [/kempes|estadio mario alberto/i, 'Córdoba'],
  [/autódromo.*la plata/i, 'La Plata'],
];

/** "23, 25 y 27 de Marzo" → ['2027-03-23', …]; sin año: la próxima vez que caiga esa fecha. */
export function fechasDF(texto, now = new Date()) {
  const hoy = new Date(now.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const out = [];
  const re = new RegExp(`((?:\\d{1,2}\\s*(?:,|y|al|-)?\\s*)+)de\\s+(${MESES.join('|')})(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'gi');
  for (const m of clean(texto).matchAll(re)) {
    const mes = MESES.indexOf(m[2].toLowerCase()) + 1;
    let dias = (m[1].match(/\d{1,2}/g) || []).map(Number);
    if (/\bal\b|-/.test(m[1]) && dias.length === 2) { const [a, b] = dias; dias = []; for (let d = a; d <= b; d++) dias.push(d); }
    for (const d of dias) {
      const md = `${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let y = m[3] ? Number(m[3]) : Number(hoy.slice(0, 4));
      if (!m[3] && `${y}-${md}` < hoy) y++;
      out.push(`${y}-${md}`);
    }
  }
  return [...new Set(out)];
}

export function linksDF(html, baseUrl) {
  return [...new Set([...html.matchAll(/href="(\/shows\/[a-z0-9-]+)"/gi)].map((m) => new URL(m[1], baseUrl).href))];
}

export function parseDFShow(html, url, now = new Date()) {
  const $ = cheerio.load(html);
  const title = clean($('.show-hero_title').first().text());
  if (!title) return [];
  const metas = $('.show-hero_meta__txt').map((_, e) => clean($(e).text())).get();
  const cuando = metas.find((t) => /\d/.test(t) && new RegExp(MESES.join('|'), 'i').test(t)) || '';
  const lugar = clean($('a.show-hero_meta__txt').first().text()) || metas.find((t) => t !== cuando) || null;
  const sede = SEDES.find(([re]) => re.test(lugar || ''));
  const compra = $('a.show-purchase_card').first().attr('href');
  return fechasDF(cuando, now).map((dia) => ({
    title,
    start: `${dia}T00:00:00-03:00`,
    whenText: cuando,
    place: lugar,
    url,
    description: compra ? `Entradas: ${new URL(compra).hostname.replace(/^www\./, '')}` : undefined,
    category: 'Música',
    ciudad: sede ? sede[1] : 'Buenos Aires',
    baseUrl: url,
  }));
}

export async function dfent(body, url, source, ctx) {
  const out = [];
  for (const link of linksDF(body, url).slice(0, source.maxLinks ?? 60)) {
    try { out.push(...parseDFShow(await ctx.fetch(link), link)); } catch (err) { ctx.warn(`${link}: ${err.message}`); }
  }
  return out;
}
