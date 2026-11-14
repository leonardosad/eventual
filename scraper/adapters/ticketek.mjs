// Ticketek: el sitio es una app que carga todo desde su API.
// 1) El buscador (prod-cms-search) lista los shows filtrando por sala.
// 2) Cada show (prod-cms-api /node?path=) trae "google_structured_data",
//    que son los datos schema.org con fecha, sala, dirección y precio.
import { zonaDe, localidadDe } from '../region.mjs';

const SEARCH = 'https://prod-cms-search.ticketek.com.ar/api/1.1/';
const NODE = 'https://prod-cms-api.ticketek.com.ar/api/1.0/node%3Fpath%3D';
const VENUE_FACET = 'field_artist_node_eb:field_show_venue:title';

export function showsFromSearch(json) {
  return (json?.resultados || []).map((r) => r.url).filter(Boolean);
}

const CATS = { musica: 'Música', teatro: 'Teatro', familia: 'Infantil', deportes: 'Deportes' };

export function eventsFromNode(json, path) {
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const parent = String(json?.category?.parent || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const category = CATS[parent];
  return (json?.google_structured_data || []).filter((d) => /Event$/.test(String(d['@type']))).map((d) => {
    const loc = first(d.location) || {};
    const addr = loc.address || {};
    const region = String(addr.addressRegion || '');
    const ciudad = addr.addressLocality || json?.venue?.city || json?.venue?.field_city || '';
    const zona = /capital|caba|ciudad aut/i.test(region) ? 'CABA'
      : zonaDe(ciudad) === 'GBA' ? 'GBA'
      : (!region && !ciudad) ? 'CABA'
      : zonaDe(ciudad, region) === 'CABA' && !/^buenos aires$/i.test(region) ? 'CABA' : 'fuera';
    const offer = first(d.offers) || {};
    return {
      title: d.name,
      start: d.startDate,
      end: d.endDate && d.endDate !== d.startDate ? d.endDate : null,
      place: loc.name,
      address: addr.streetAddress || null,
      zona,
      localidad: zona === 'GBA' ? localidadDe(ciudad) : null,
      _region: region, _ciudad: ciudad,
      image: first(d.image),
      price: offer.price != null ? String(offer.price) : '',
      currency: offer.priceCurrency,
      url: offer.url || `https://www.ticketek.com.ar/${path}`,
      baseUrl: 'https://www.ticketek.com.ar/',
      category, // Ticketek marca todo como MusicEvent; la categoría real viene en json.category
    };
  });
}

export async function ticketek(body, url, source, ctx) {
  const root = JSON.parse(body);
  const venues = (root?.filtros?.[VENUE_FACET]?.valores || []).map((v) => v.url).filter(Boolean);
  const paths = new Set();
  for (const v of venues) {
    let next = v;
    for (let page = 0; next && page < 5; page++) {
      try {
        const json = JSON.parse(await ctx.fetch(SEARCH + next.replace(/^\//, '')));
        const found = showsFromSearch(json);
        const before = paths.size;
        found.forEach((p) => paths.add(p));
        next = found.length && paths.size > before ? json.siguiente : null;
      } catch (err) {
        ctx.warn(`buscador ${v}: ${err.message}`);
        next = null;
      }
    }
  }
  const out = [];
  const descartes = new Map();
  for (const path of [...paths].slice(0, source.maxLinks ?? 200)) {
    try {
      const json = JSON.parse(await ctx.fetch(NODE + path.replace(/\//g, '--')));
      for (const ev of eventsFromNode(json, path)) {
        if (ev.zona === 'fuera') { const k = `${ev.place} | ${ev._region} | ${ev._ciudad}`; descartes.set(k, (descartes.get(k) || 0) + 1); }
        out.push(ev);
      }
    } catch (err) {
      ctx.warn(`${path}: ${err.message}`);
    }
  }
  if (descartes.size) console.log('   Ticketek fuera de zona:', [...descartes].map(([k, n]) => `${k} (${n})`).join(' · '));
  return out;
}
