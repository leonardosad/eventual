// Complejo Teatral de Buenos Aires (San Martín, Regio, De la Ribera, Sarmiento,
// Alvear, El Plata): la agenda se consulta día por día en /agenda/?fecha=DD-MM-AAAA.
import * as cheerio from 'cheerio';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function parseComplejoDay(html, dayKey, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('.small_item').each((_, el) => {
    const $el = $(el);
    const title = clean($el.find('h2').first().text());
    if (!title) return;
    const info = $el.find('a').filter((_, a) => /info/i.test($(a).text())).first().attr('href');
    const buy = $el.find('a.buy').first().attr('href');
    const cat = clean($el.find('.category').first().text());
    out.push({
      title,
      start: `${dayKey}T00:00:00-03:00`,
      whenText: clean($el.find('.date').first().text()) || null,
      place: clean($el.find('.place').first().text()).replace(/^\/\s*/, '') || 'Complejo Teatral de Buenos Aires',
      image: $el.find('[data-background-image]').first().attr('data-background-image'),
      description: [cat, clean($el.find('.bajada').first().text())].filter(Boolean).join(' · '),
      url: info || buy || baseUrl,
      category: /cine/i.test(cat) ? 'Cine' : /m[uú]sica|opera rock/i.test(cat) ? 'Música'
        : /foto|muestra|exposici/i.test(cat) ? 'Arte y muestras' : /t[ií]teres|grandes y chicos/i.test(cat) ? 'Infantil' : 'Teatro',
      baseUrl,
    });
  });
  return out;
}

export async function complejo(body, url, source, ctx, now = new Date()) {
  const days = source.options?.daysAhead ?? 14;
  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(now.getTime() - 3 * 3600e3 + i * 864e5);
    const key = d.toISOString().slice(0, 10);
    const [y, m, dd] = key.split('-');
    const pageUrl = new URL(`/agenda/?fecha=${dd}-${m}-${y}`, url).href;
    try {
      out.push(...parseComplejoDay(await ctx.fetch(pageUrl), key, pageUrl));
    } catch (err) {
      ctx.warn(`${pageUrl}: ${err.message}`);
    }
  }
  return out;
}
