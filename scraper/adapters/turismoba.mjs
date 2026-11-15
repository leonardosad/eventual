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

const DOW = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, feriado: -1 };
const CATS = { 'música': 'Música', musica: 'Música', teatro: 'Teatro', danza: 'Teatro', infantil: 'Infantil',
  'artes visuales': 'Arte y muestras', 'exposición': 'Arte y muestras', exposicion: 'Arte y muestras', feria: 'Ferias',
  deporte: 'Deportes', 'gastronomía': 'Gastronomía', gastronomia: 'Gastronomía' };

/** Lista de actividades que la página guarda en `const json = \`[...]\`` (buscador oficial). */
export function actividadesTurismo(html) {
  const m = html.match(/const\s+json\s*=\s*`([\s\S]*?)`\s*;?/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

function horaDe(texto) {
  // Primera hora que aparece: "10 a 19 h" → 10:00, "de 19 a 02 h" → 19:00, "19:30 h" → 19:30
  const t = norm(texto);
  const m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\b|a\s+\d)/);
  if (!m) return null;
  const h = Number(m[1]);
  return h <= 23 ? `${pad(h)}:${m[2] || '00'}` : null;
}

export function parseTurismoBA(html, baseUrl, now = new Date()) {
  const $ = cheerio.load(html);
  // Texto de la página con espacios entre etiquetas (para que "noviembre" no quede pegado a lo siguiente)
  const week = weekRange(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '), now);
  if (!week) return [];
  const acts = actividadesTurismo(html);
  if (acts?.length) {
    // Días de la semana publicada con su día de la semana
    const dias = [];
    for (let d = new Date(week.start); d <= new Date(week.end); d = new Date(d.getTime() + 864e5)) {
      const key = new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
      dias.push({ key, dow: new Date(`${key}T12:00:00Z`).getUTCDay() });
    }
    const out = [];
    for (const a of acts) {
      const nombre = String(a.nombre_actividad || '').trim();
      if (!nombre) continue;
      const filtro = String(a.dias_filtro || '').split(',').map((x) => DOW[norm(x)]).filter((x) => x >= 0);
      const hora = horaDe(a.dias_horarios);
      const elegidos = filtro.length ? dias.filter((d) => filtro.includes(d.dow)) : [];
      const base = {
        title: nombre,
        whenText: String(a.dias_horarios || '').trim() || null,
        place: String(a.proveedor || '').trim() || null,
        address: [a.calle_altura, a.barrio && a.barrio !== 'CABA' ? a.barrio : null].filter((x) => x && String(x).trim()).join(', ') || null,
        description: a.descripcion,
        image: a.foto,
        url: a.url_boton || baseUrl,
        free: String(a.precio_filtro).trim() === '0' || /gratis/i.test(a.tags || ''),
        category: CATS[norm(a.categoria_actividad_filtro)] || undefined,
        baseUrl,
      };
      if (elegidos.length) {
        for (const d of elegidos) out.push({ ...base, start: `${d.key}T${hora || '00:00'}:00-03:00` });
      } else {
        out.push({ ...base, start: week.start, end: week.end });
      }
    }
    return out;
  }
  // Formato anterior: JSON-LD + texto "¿Cuándo?" de cada tarjeta

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
