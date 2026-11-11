// Enigma Tickets (enigmatickets.com): el sitio está hecho con Remix y deja los datos
// del listado en window.__remixContext dentro del HTML. En la portada,
// loaderData["routes/_index"].nextEvents trae los próximos eventos con fechas
// exactas (segundos Unix), sala, imagen y precio mínimo.

const TZ_MS = 3 * 3600e3;
const toIso = (sec) => new Date(sec * 1000 - TZ_MS).toISOString().slice(0, 19) + '-03:00';

export function remixData(html) {
  const m = html.match(/window\.__remixContext\s*=\s*(\{[\s\S]*?\});\s*(?:__remixContext|<\/script>)/);
  if (!m) throw new Error('no se encontró __remixContext (¿cambió el sitio?)');
  return JSON.parse(m[1]).state?.loaderData || {};
}

export function parseEnigma(html, baseUrl, opts = {}) {
  const data = remixData(html);
  const list = Object.values(data).flatMap((d) => d?.nextEvents || d?.initialEvents || []);
  const exclude = opts.exclude ? new RegExp(opts.exclude, 'i') : null;
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!e?.uid || seen.has(e.uid) || e.finished || e.isFinished) continue;
    seen.add(e.uid);
    const venue = e.venue?.name || '';
    if (exclude && exclude.test(`${e.title} ${venue}`)) continue;
    const dates = (e.eventDates || []).filter(Number.isFinite).sort((a, b) => a - b);
    if (!dates.length) continue;
    const label = Object.values(e.schedules || {}).map((s) => s?.labelForReplaceDate).find(Boolean) || '';
    // eventDates trae solo el día; la hora viene en el texto ("Sáb 14/11 19:30hs")
    let start = toIso(dates[0]);
    const t = label.match(/\b(\d{1,2})[:.](\d{2})\s*h/i) || label.match(/\b(\d{1,2})\s*hs\b/i);
    if (t && start.slice(11, 16) === '00:00') start = `${start.slice(0, 11)}${t[1].padStart(2, '0')}:${t[2] || '00'}:00-03:00`;
    const simple = /^\S+\s+\d{1,2}\/\d{1,2}\s+\d{1,2}([:.]\d{2})?\s*hs?$/i.test(label.trim());
    out.push({
      title: String(e.title || '').trim(),
      start,
      end: dates.length > 1 ? toIso(dates[dates.length - 1]) : null,
      whenText: (label && !simple ? label : null) || (e.isSoldOut ? 'Agotado' : null),
      place: venue && venue !== 'Argentina' ? venue : null,
      image: e.imageUrl || e.smallImageUrl,
      price: e.minPrice > 0 ? String(e.minPrice) : '',
      url: new URL(`/event/${e.uid}`, baseUrl).href,
      baseUrl,
    });
  }
  return out;
}
