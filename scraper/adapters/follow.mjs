// Entra a una página de listado, sigue los links de cada evento y lee los datos
// schema.org (JSON-LD) de cada página de evento. Sirve para AllAccess y para la
// ticketera de Konex, que usan la misma plataforma.
import * as cheerio from 'cheerio';
import { parseJsonLd } from './jsonld.mjs';

export function extractLinks(html, baseUrl, pattern) {
  const $ = cheerio.load(html);
  const re = new RegExp(pattern);
  const out = new Set();
  $('a[href]').each((_, a) => {
    try {
      const u = new URL($(a).attr('href'), baseUrl);
      u.hash = '';
      if (re.test(u.href)) out.add(u.href);
    } catch { /* link roto */ }
  });
  return [...out];
}

export function filterByPlace(events, includePattern) {
  if (!includePattern) return events;
  const re = new RegExp(includePattern, 'i');
  return events.filter((e) => {
    const where = `${e.place || ''} ${e.address || ''}`.trim();
    return !where || re.test(where);
  });
}

export async function follow(body, url, source, ctx) {
  const links = extractLinks(body, url, source.linkPattern).slice(0, source.maxLinks ?? 60);
  const out = [];
  for (const link of links) {
    try {
      const html = await ctx.fetch(link);
      for (const ev of parseJsonLd(html, link)) {
        if (source.placePrefix && ev.place && !ev.place.includes(source.placePrefix)) {
          ev.place = `${source.placePrefix} · ${ev.place}`;
        }
        ev.url ||= link;
        out.push(ev);
      }
    } catch (err) {
      ctx.warn(`${link}: ${err.message}`);
    }
  }
  return filterByPlace(out, source.placeInclude);
}
