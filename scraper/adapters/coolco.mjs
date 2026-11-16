// CoolCo Tickets (boletería del Estadio Obras Sanitarias): la portada lista
// los eventos y cada página de evento trae un bloque oculto #datos-seo-evento
// (nombre, lugar, dirección, precio) y las funciones en "fechaCelebracion".
import * as cheerio from 'cheerio';

const NO_EVENTO = /\/(main|registroUsuario|cookiePolicy|legalConditions|evento)(\b|$|[?#])/i;

export function linksCoolco(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = new Set();
  $('a[href]').each((_, a) => {
    let u;
    try { u = new URL($(a).attr('href'), baseUrl); } catch { return; }
    if (u.hostname !== new URL(baseUrl).hostname) return;
    if (!/^\/tickets-ar\/es\/[a-z0-9-]+$/i.test(u.pathname) || NO_EVENTO.test(u.pathname)) return;
    out.add(u.origin + u.pathname);
  });
  return [...out];
}

export function parseCoolcoEvento(html, url) {
  const $ = cheerio.load(html);
  const seo = (k) => $(`#seo-${k}`).first().text().trim();
  const title = seo('name') || $('meta[property="og:title"]').attr('content')?.replace(/\s+-\s+Estadio Obras.*$/i, '');
  if (!title) return [];
  let fechas = [...new Set([...html.matchAll(/"fechaCelebracion":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[0-9]:00)/g)].map((m) => m[1]))];
  if (!fechas.length && seo('fecha')) fechas = [`${seo('fecha').slice(0, 16)}:00-03:00`];
  const min = seo('precio-min');
  const tags = $('meta[property="og:tag"]').map((_, m) => $(m).attr('content')).get().join(' ');
  const base = {
    title,
    place: seo('lugar') || 'Estadio Obras Sanitarias',
    address: seo('direccion') || 'Av. del Libertador 7395',
    description: seo('description') || $('meta[property="og:description"]').attr('content'),
    image: seo('image') || $('meta[property="og:image"]').attr('content'),
    url,
    price: min && Number(min) > 0 ? String(Number(min)) : '',
    currency: 'ARS',
    category: /teatro|stand ?up|humor/i.test(tags) ? 'Teatro' : 'Música',
    ciudad: seo('ciudad') || 'Buenos Aires',
    baseUrl: url,
  };
  return fechas.map((start) => ({ ...base, start }));
}

export async function coolco(body, url, source, ctx) {
  const out = [];
  for (const link of linksCoolco(body, url).slice(0, source.maxLinks ?? 80)) {
    try {
      out.push(...parseCoolcoEvento(await ctx.fetch(link), link));
    } catch (err) {
      ctx.warn(`${link}: ${err.message}`);
    }
  }
  return out;
}
