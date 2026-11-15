// Festivalear (festivalear.com/ar/es/eventos): festivales y fiestas populares de todo el país.
// Tarjetas a.fl-card con .fl-card-fecha ("2 al 5 de enero de 2026", "3 de enero de 2026",
// "30 de enero al 2 de febrero de 2026" o "Fecha a confirmar"), .fl-card-tit y .fl-card-ub ("Ciudad, Provincia").
import * as cheerio from 'cheerio';
import { ubicar } from '../region.mjs';

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const pad = (n) => String(n).padStart(2, '0');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function rangoFestivalear(texto) {
  const t = norm(texto).replace(/1°/g, '1');
  // "30 de enero al 2 de febrero de 2026" | "2 al 5 de enero de 2026"
  let m = t.match(/(\d{1,2})(?: de ([a-z]+))?(?: de (\d{4}))? al (\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (m && MESES[m[5]]) {
    const [, d1, mes1, y1, d2, mes2, y2] = m;
    const mo2 = MESES[mes2];
    const mo1 = mes1 ? MESES[mes1] : mo2;
    const anio1 = y1 ? Number(y1) : (mo1 > mo2 ? Number(y2) - 1 : Number(y2));
    if (!mo1) return null;
    return { start: `${anio1}-${pad(mo1)}-${pad(d1)}T00:00:00-03:00`, end: `${y2}-${pad(mo2)}-${pad(d2)}T23:59:00-03:00` };
  }
  m = t.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (m && MESES[m[2]]) return { start: `${m[3]}-${pad(MESES[m[2]])}-${pad(m[1])}T00:00:00-03:00`, end: null };
  return null; // "Fecha a confirmar"
}

export function parseFestivalear(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('a.fl-card').each((_, a) => {
    const $a = $(a);
    // La web marca los destacados con "★" delante del nombre
    const title = $a.find('.fl-card-tit').text().replace(/[★☆✪⭐]/g, '').replace(/\s+/g, ' ').trim();
    const fecha = $a.find('.fl-card-fecha').text().replace(/\s+/g, ' ').trim();
    const ub = $a.find('.fl-card-ub').text().replace(/\s+/g, ' ').trim();
    const r = rangoFestivalear(fecha);
    if (!title || !r) return;
    const i = ub.lastIndexOf(',');
    const ciudad = i > 0 ? ub.slice(0, i).trim() : ub;
    const prov = i > 0 ? ub.slice(i + 1).trim() : '';
    const u = ubicar({ ciudad, provincia: prov }, { ambiguo: 'nada' }) || { provincia: null, zona: null, localidad: ciudad || null };
    out.push({
      title,
      start: r.start,
      end: r.end,
      whenText: r.end ? fecha : null,
      place: ub || null,
      image: $a.find('img').first().attr('src') || null,
      url: $a.attr('href'),
      category: /festival|serenata|chacarera|folklore|folclore|rock|jazz|tango|canto/i.test(title) ? 'Música' : 'Fiestas',
      provincia: u.provincia,
      zona: u.zona,
      localidad: u.provincia === 'CABA' ? null : (u.localidad || ciudad || null),
      baseUrl,
    });
  });
  return out;
}
