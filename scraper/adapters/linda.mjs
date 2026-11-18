// "Linda" — agenda oficial de la Ciudad de Buenos Aires (linda.buenosaires.gob.ar).
// La página usa una API JSON pública: /api/frontend/events/filter?limit=N
// con cada evento, sus funciones (fechasDelEvento, en UTC), el lugar y si es gratis.
const clean = (s) => String(s || '').replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();
const sinHtml = (s) => clean(String(s || '').replace(/<[^>]+>/g, ' '));

/** "2026-11-13T18:00:00.000Z" → "2026-11-13T15:00:00-03:00" */
export function aLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 19) + '-03:00';
}

function categoria(etiquetas, title) {
  const t = etiquetas.map(clean).join(' | ');
  if (/m[uú]sica/i.test(t)) return 'Música';
  if (/teatro|esc[eé]nicas/i.test(t)) return 'Teatro';
  if (/\bcine\b/i.test(t)) return 'Cine';
  if (/gastronom/i.test(t)) return 'Gastronomía';
  if (/deporte/i.test(t)) return 'Deportes';
  if (/ferias/i.test(t) && /feria|mercado|bazar/i.test(title)) return 'Ferias';
  if (/arte|exposiciones/i.test(t)) return 'Arte y muestras';
  return undefined; // que lo decida el clasificador general
}

export function parseLinda(body, url, options = {}) {
  const json = typeof body === 'string' ? JSON.parse(body) : body;
  const maxFunciones = options.maxFunciones ?? 20;
  const out = [];
  for (const e of json.events || []) {
    const title = clean(e.title);
    if (!title) continue;
    const fechas = [...new Set((e.fechasDelEvento || []).map(aLocal).filter(Boolean))].sort();
    const dir = clean(e.ubicacion?.direccion || e.direccion)
      .replace(/,\s*[A-Z]\d{4}[A-Z]{0,3}\b.*$/, '') // código postal (C1042AAO) y lo que sigue
      .replace(/,\s*(Cdad\.? Autónoma de )?Buenos Aires.*$/i, '');
    const base = {
      title,
      description: sinHtml(e.description),
      image: e.imageUrl || undefined,
      url: e.slug ? new URL(`/eventos/${e.slug}`, url).href : url,
      baseUrl: url,
      place: clean(e.ubicacion?.titulo) || null,
      address: dir || null,
      free: e.acceso === 'sin_costo' || undefined,
      category: categoria(e.etiquetas || [], title),
    };
    if (!fechas.length) {
      const s = aLocal(e.fechaInicio);
      if (s) out.push({ ...base, start: s, end: aLocal(e.fechaFin) || undefined });
    } else if (fechas.length > maxFunciones) {
      // Muestras y actividades de todos los días: un solo evento con fecha de cierre
      out.push({ ...base, start: fechas[0], end: aLocal(e.fechaFin) || fechas.at(-1) });
    } else {
      for (const start of fechas) out.push({ ...base, start });
    }
  }
  return out;
}
