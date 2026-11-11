// Lectores para clubes de jazz y la ticketera Livepass.
import * as cheerio from 'cheerio';

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n) => String(n).padStart(2, '0');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Bebop Club (Next.js): cada tarjeta tiene un link "Ver evento …" a su ticketera y la
// fecha armada en bloques: [11] [nov 2026] [22] [30 hrs].
export function parseBebop(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $('a[aria-label^="Ver evento"]').each((_, a) => {
    const $a = $(a);
    const url = $a.attr('href');
    const card = $a.parent();
    const big = card.find('span.text-4xl').map((_, s) => $(s).text().trim()).get();
    const smallBlocks = card.find('div.pb-0\\.5').map((_, d) => [$(d).children('span').map((_, s) => $(s).text().trim()).get()]).get();
    const [day, hour] = big;
    const [mes, anio] = smallBlocks[0] || [];
    const [min] = smallBlocks[1] || [];
    const mo = MESES[String(mes || '').toLowerCase().slice(0, 3)];
    if (!url || !day || !mo || !anio || seen.has(url)) return;
    seen.add(url);
    let image = card.find('img').first().attr('src') || '';
    const m = image.match(/[?&]url=([^&]+)/);
    if (m) image = decodeURIComponent(m[1]);
    out.push({
      title: clean(card.find('p').first().text()) || clean($a.attr('aria-label').replace(/^Ver evento\s*/, '')),
      start: `${anio}-${pad(mo)}-${pad(day)}T${/^\d{1,2}$/.test(hour || '') ? pad(hour) : '00'}:${/^\d{2}$/.test(min || '') ? min : '00'}:00-03:00`,
      place: 'Bebop Club',
      address: 'Moreno 364, San Telmo',
      image: image ? new URL(image, baseUrl).href : null,
      url,
      baseUrl,
    });
  });
  return out;
}

// Livepass (plataforma Ticketplus): el buscador del sitio devuelve JSON con todos
// los eventos. La fecha viene como texto ("Sábado 14 de Noviembre 20:00").
export function parseLivepass(text, baseUrl, opts = {}) {
  const data = JSON.parse(text);
  const include = new RegExp(opts.locationInclude || 'Buenos Aires, Argentina$', 'i');
  const exclude = opts.locationExclude ? new RegExp(opts.locationExclude, 'i') : null;
  return (data.results || [])
    .filter((e) => e.location && include.test(e.location.trim()) && !(exclude && exclude.test(e.location)))
    .filter((e) => !/merchandising|membres[ií]a|prueba/i.test(e.title))
    .map((e) => {
      // Algunos ids terminan con la fecha completa: …-2026-11-14-20-30-00-0300
      const m = String(e.id || '').match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-\d{2}-\d{4}$/);
      return {
        title: e.title,
        start: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00` : e.date,
        place: e.location.replace(/,\s*Buenos Aires, Argentina$/i, ''),
        image: e.img,
        price: Number(e.price) > 0 ? String(Math.round(Number(e.price))) : '',
        currency: e.currency,
        url: e.url,
        category: /teatro/i.test(e.category) ? 'Teatro' : /fiesta/i.test(e.category) ? 'Fiestas' : undefined,
        baseUrl,
      };
    });
}
