// Extrae eventos publicados con schema.org (JSON-LD y microdatos).
// La mayoría de las ticketeras y agendas los incluyen para Google,
// por eso es la forma más estable de leer otros sitios.
import * as cheerio from 'cheerio';

const isEventType = (t) => {
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === 'string' && /Event$/.test(x.replace(/^.*[\/#:]/, '')));
};

function* walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (isEventType(node['@type'])) yield node;
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'subEvent', 'event', 'events']) {
    if (node[key]) yield* walk(node[key]);
  }
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

function locationOf(loc) {
  loc = first(loc);
  if (!loc) return {};
  if (typeof loc === 'string') return { place: loc };
  const addr = first(loc.address);
  const address = typeof addr === 'string'
    ? addr
    : [addr?.streetAddress, addr?.addressLocality].filter(Boolean).join(', ');
  return { place: loc.name || address, address };
}

function offerOf(offers) {
  const o = first(offers);
  if (!o) return {};
  const price = o.price ?? o.lowPrice ?? o.priceSpecification?.price;
  return { price: price != null ? String(price) : '', currency: o.priceCurrency };
}

export function parseJsonLd(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    const text = $(el).contents().text().trim();
    try { data = JSON.parse(text); } catch {
      try { data = JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')); } catch { return; }
    }
    for (const ev of walk(data)) {
      const img = first(ev.image);
      out.push({
        title: ev.name,
        start: ev.startDate,
        end: ev.endDate,
        url: first(ev.url) || ev['@id'],
        image: typeof img === 'string' ? img : img?.url,
        description: ev.description,
        free: ev.isAccessibleForFree === true || ev.isAccessibleForFree === 'true',
        ...locationOf(ev.location),
        ...offerOf(ev.offers),
        baseUrl,
      });
    }
  });
  return out;
}

export function parseMicrodata(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('[itemscope][itemtype]').each((_, el) => {
    const type = $(el).attr('itemtype') || '';
    if (!/schema\.org\/\w*Event$/.test(type)) return;
    const prop = (name) => {
      const p = $(el).find(`[itemprop="${name}"]`).first();
      return p.attr('content') || p.attr('datetime') || p.attr('href') || p.attr('src') || p.text();
    };
    out.push({
      title: prop('name'),
      start: prop('startDate'),
      end: prop('endDate'),
      url: prop('url'),
      image: prop('image'),
      description: prop('description'),
      place: $(el).find('[itemprop="location"] [itemprop="name"]').first().text() || undefined,
      price: prop('price'),
      baseUrl,
    });
  });
  return out;
}

export function parseAuto(html, baseUrl) {
  const ld = parseJsonLd(html, baseUrl);
  return ld.length ? ld : parseMicrodata(html, baseUrl);
}
