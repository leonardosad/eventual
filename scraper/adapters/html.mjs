// Adaptador genérico por selectores CSS, para sitios sin datos estructurados.
// Cada fuente define en sources.json qué selector corresponde a cada campo.
import * as cheerio from 'cheerio';

export function parseHtml(html, baseUrl, selectors) {
  if (!selectors?.item) throw new Error('Falta "selectors.item" en la fuente');
  const $ = cheerio.load(html);
  const out = [];
  const get = ($el, sel, attrs = []) => {
    if (!sel) return '';
    const n = $el.find(sel).first();
    if (!n.length) return '';
    for (const a of attrs) if (n.attr(a)) return n.attr(a);
    return n.text();
  };
  $(selectors.item).each((_, el) => {
    const $el = $(el);
    out.push({
      title: get($el, selectors.title),
      start: get($el, selectors.date, ['datetime', 'content']),
      url: get($el, selectors.link || 'a', ['href']),
      place: get($el, selectors.place),
      image: get($el, selectors.image || 'img', ['src', 'data-src']),
      price: get($el, selectors.price),
      description: get($el, selectors.description),
      whenText: get($el, selectors.whenText),
      baseUrl,
    });
  });
  return out;
}
