// TuEntrada (tuentrada.com): ticketera del Teatro Gran Rex, el Colón y otras salas.
// La portada lista los eventos en tarjetas con un ícono de calendario (fecha) y
// otro de ubicación (sala), más un botón "Comprar entradas" con el link.
import * as cheerio from 'cheerio';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function parseTuEntrada(html, baseUrl, opts = {}) {
  const $ = cheerio.load(html);
  const exclude = opts.exclude ? new RegExp(opts.exclude, 'i') : null;
  const seen = new Set();
  const out = [];
  $('svg.lucide-calendar-days').each((_, svg) => {
    const dateText = clean($(svg).parent().text());
    // Subir hasta el bloque que tiene el título y el link de compra
    let card = $(svg).parent();
    for (let i = 0; i < 8 && card.length && !(card.find('h2, h3').length && card.find('a[href]').length); i++) card = card.parent();
    if (!card.length) return;
    const title = clean(card.find('h2, h3').first().text());
    const href = card.find('a[href]').filter((_, a) => /comprar/i.test($(a).text())).first().attr('href') || card.find('a[href]').last().attr('href');
    const venue = clean(card.find('svg.lucide-map-pin').first().parent().text());
    if (!title || !href || !dateText) return;
    const url = new URL(href, baseUrl).href;
    if (seen.has(url)) return;
    seen.add(url);
    if (exclude && exclude.test(`${venue} ${title}`)) return;
    // La imagen puede estar en el bloque o en el hermano anterior (carrusel)
    const img = card.find('img').first().attr('src') || card.parent().find(`img[alt="${title.replace(/"/g, '')}"]`).first().attr('src');
    out.push({
      title,
      start: dateText.replace(/^desde el\s+/i, ''),
      whenText: /desde|\+/i.test(dateText) ? dateText : null,
      place: venue || null,
      image: img || null,
      url,
      baseUrl,
    });
  });
  return out;
}
