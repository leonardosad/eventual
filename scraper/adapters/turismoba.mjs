// Turismo Buenos Aires ("Qué hacer esta semana"): publica las actividades en
// JSON-LD, pero en startDate pone la fecha de publicación de la nota, no la del
// evento. Las fechas reales están en el texto "¿Cuándo?" de cada tarjeta y en
// el encabezado de la semana ("Desde el lunes 26 de octubre al domingo 1 de noviembre").
// Tomamos cada actividad como válida durante esa semana y mostramos el texto "¿Cuándo?".
import * as cheerio from 'cheerio';
import { parseJsonLd } from './jsonld.mjs';

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const pad = (n) => String(n).padStart(2, '0');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function weekRange(text, now = new Date()) {
  const m = norm(text).match(/desde el \w+ (\d{1,2})(?: de (\w+))? al \w+ (\d{1,2}) de (\w+)/);
  if (!m) return null;
  const [, d1, m1raw, d2, m2raw] = m;
  const m2 = MESES[m2raw];
  const m1 = m1raw ? MESES[m1raw] : m2;
  if (!m1 || !m2) return null;
  let y2 = now.getFullYear();
  // Si el fin de semana cae muy lejos en el futuro, es del año anterior (y viceversa).
  const candidate = new Date(`${y2}-${pad(m2)}-${pad(d2)}T12:00:00-03:00`);
  if (candidate - now > 180 * 864e5) y2 -= 1;
  else if (now - candidate > 180 * 864e5) y2 += 1;
  const y1 = m1 > m2 ? y2 - 1 : y2;
  return {
    start: `${y1}-${pad(m1)}-${pad(d1)}T00:00:00-03:00`,
    end: `${y2}-${pad(m2)}-${pad(d2)}T23:59:00-03:00`,
  };
}

export function parseTurismoBA(html, baseUrl, now = new Date()) {
  const $ = cheerio.load(html);
  const week = weekRange($('body').text(), now);
  if (!week) return [];

  // Texto "¿Cuándo?" de cada tarjeta, por título
  const cuando = new Map();
  $('.panel-teaser').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h2').first().text();
    const label = $el.find('b').filter((_, b) => /cu[aá]ndo/i.test($(b).text())).first();
    const txt = label.closest('p').next('p').text().replace(/\s+/g, ' ').trim();
    if (title && txt) cuando.set(norm(title), txt);
  });

  return parseJsonLd(html, baseUrl).map((ev) => ({
    ...ev,
    start: week.start,
    end: week.end,
    whenText: cuando.get(norm(ev.title)) || 'Esta semana',
  }));
}
