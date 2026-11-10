// Alternativa Teatral: la cartelera se arma en el navegador a partir de
// get-json.php?t=novedades&r=cartelera, que trae todas las obras con sus salas
// y funciones semanales (día, hora, desde/hasta). Acá expandimos esas funciones
// a fechas concretas para los próximos días.

const TZ_OFFSET = '-03:00';
const pad = (n) => String(n).padStart(2, '0');

function baDateKey(date) {
  return new Date(date.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}
function addDays(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (key) => new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = domingo

export function parseAlternativa(text, baseUrl, opts = {}, now = new Date()) {
  const json = text.replace(/^[^(]*\(\s*﻿?/, '').replace(/\)\s*;?\s*$/, '');
  const data = JSON.parse(json);
  const daysAhead = opts.daysAhead ?? 14;
  const provincias = (opts.provincias ?? ['CABA']).map((p) => p.toLowerCase());
  const today = baDateKey(now);
  const out = [];

  for (const [id, obra] of Object.entries(data.espectaculos || {})) {
    const clas = Object.values(obra.clasificaciones || {}).map((c) => c.descripcion);
    const url = obra.url ? new URL(obra.url, 'https://www.alternativateatral.com/').href : baseUrl;
    const image = obra.imagen_ficha ? `https://${obra.imagen_ficha.replace(/^https?:\/\//, '')}` : null;
    const infantil = clas.some((c) => /niñ|infantil|famil/i.test(c));
    const musica = clas.some((c) => /música|musica|recital|concierto|banda/i.test(c)) && !clas.includes('Teatro');

    for (const lugar of Object.values(obra.lugares || {})) {
      if (provincias.length && !provincias.includes(String(lugar.provincia || '').toLowerCase())) continue;
      const funs = Object.values(lugar.funciones || {});
      for (let i = 0; i <= daysAhead; i++) {
        const key = addDays(today, i);
        const horas = funs
          .filter((f) => f.fecha_desde <= key && key <= f.fecha_hasta && Number(f.nro_dia) - 1 === dow(key))
          .map((f) => f.hora)
          .filter(Boolean)
          .sort();
        if (!horas.length) continue;
        const unicas = [...new Set(horas)];
        out.push({
          title: obra.titulo,
          start: `${key}T${unicas[0]}:00${TZ_OFFSET}`,
          whenText: unicas.length > 1 ? `${unicas.join(' y ')} h` : null,
          place: lugar.nombre,
          address: [lugar.direccion, lugar.zona].filter(Boolean).join(', '),
          url,
          image,
          description: clas.filter((c) => !/^(Adultos|Presencial|Artes Escénicas)$/.test(c)).join(' · '),
          category: infantil ? 'Infantil' : musica ? 'Música' : 'Teatro',
          baseUrl,
          externalId: `${id}-${key}`,
        });
      }
    }
  }
  return out;
}
