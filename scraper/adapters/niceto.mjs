// Niceto Club (Niceto Club, Humboldt y Niceto Bar): la agenda de nicetoclub.com/agenda/
// tiene una tarjeta .event-card por evento, con el nombre y la sala en atributos
// data-* y la fecha armada en bloques ("6" "NOV 2026" | "18" "00 hs").
import * as cheerio from 'cheerio';

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n) => String(n).padStart(2, '0');

export function parseNiceto(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('.event-card').each((_, el) => {
    const $el = $(el);
    const title = ($el.attr('data-name') || $el.find('h3').first().text()).replace(/\s+/g, ' ').trim();
    const big = $el.find('div').filter((_, d) => /font-size:\s*32px/.test($(d).attr('style') || '')).map((_, d) => $(d).text().trim()).get();
    const small = $el.find('div').filter((_, d) => /flex-direction:\s*column/.test($(d).attr('style') || ''))
      .map((_, d) => $(d).html().split(/<br\s*\/?>/i).map((s) => $('<i>' + s + '</i>').text().trim())).get();
    // small queda aplanado: [MES, AÑO, MINUTOS, "hs"]
    const [day, hour] = big;
    const [mes, anio, min] = small;
    const mo = MESES[String(mes || '').toLowerCase().slice(0, 3)];
    if (!title || !day || !mo || !anio) return;
    const time = /^\d{1,2}$/.test(hour || '') ? `${pad(hour)}:${pad(/^\d{1,2}$/.test(min || '') ? min : 0)}` : '00:00';
    const img = $el.find('img').first();
    const sala = $el.attr('data-lugar') || 'Niceto Club';
    out.push({
      title: title.replace(/\s*\(\+18 años\)\s*/i, ' ').trim().replace(/\s+en\s+(Niceto (Club|Bar)|Humboldt.*)$/i, '').trim(),
      start: `${anio}-${pad(mo)}-${pad(day)}T${time}:00-03:00`,
      place: sala,
      address: 'Niceto Vega 5510, Palermo',
      image: img.attr('data-lazy-src') || img.attr('src'),
      description: $el.children('div').first().text().trim(),
      url: $el.find('a[href]').first().attr('href') || baseUrl,
      baseUrl,
    });
  });
  return out;
}
