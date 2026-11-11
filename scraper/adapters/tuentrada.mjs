// TuEntrada (tuentrada.com): ticketera del Teatro Gran Rex, el Colón y otras salas.
// La portada (Next.js) trae en su "flight data" un objeto por evento:
// {"id":…,"model":"event","slug":"…","name":"…","venue":"…","imageMainNew":{"src":…},"dateRange":"12-11-2026 21:00 hs"}
// TuEntrada vende en todo el país, así que se filtra por sala (venueInclude).

export function flightText(html) {
  const parts = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { parts.push(JSON.parse(m[1])); } catch { /* fragmento raro */ }
  }
  return parts.join('');
}

function objectsAt(text, marker) {
  const out = [];
  let i = text.indexOf(marker);
  while (i >= 0) {
    let depth = 0, j = i, inStr = false;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    try { out.push(JSON.parse(text.slice(i, j + 1))); } catch { /* incompleto */ }
    i = text.indexOf(marker, j);
  }
  return out;
}

export function parseDateRange(s) {
  const t = String(s || '');
  const m = t.match(/(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return {};
  const start = `${m[3]}-${m[2]}-${m[1]}T${m[4] ? m[4].padStart(2, '0') : '00'}:${m[5] || '00'}:00-03:00`;
  const e = t.match(/al\s+(\d{2})-(\d{2})-(\d{4})/);
  return { start, end: e ? `${e[3]}-${e[2]}-${e[1]}T23:59:00-03:00` : null };
}

export function parseTuEntrada(html, baseUrl, opts = {}) {
  const include = opts.venueInclude ? new RegExp(opts.venueInclude, 'i') : null;
  const seen = new Set();
  const out = [];
  const venues = new Map();
  for (const e of objectsAt(flightText(html), '{"id":')) {
    if (e.model !== 'event' || !e.slug || seen.has(e.slug)) continue;
    seen.add(e.slug);
    venues.set(e.venue, (venues.get(e.venue) || 0) + 1);
    if (include && !include.test(e.venue || '')) continue;
    const { start, end } = parseDateRange(e.dateRange);
    if (!start) continue;
    out.push({
      title: e.name,
      start,
      end,
      whenText: /^del\b/i.test(e.dateRange || '') ? e.dateRange : null,
      place: e.venue || null,
      image: e.imageMainNew?.src || null,
      url: new URL(e.slug, baseUrl).href,
      baseUrl,
    });
  }
  if (opts.logVenues) console.log('   salas de TuEntrada:', [...venues].map(([v, n]) => `${v} (${n})`).join(' · '));
  return out;
}
