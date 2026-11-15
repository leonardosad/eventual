// Alternativa Teatral: la cartelera se arma en el navegador a partir de
// get-json.php?t=novedades&r=cartelera, que trae todas las obras con sus salas
// y funciones semanales (día, hora, desde/hasta). Acá expandimos esas funciones
// a fechas concretas para los próximos días.
import { ubicar } from '../region.mjs';

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
  const hasta = String(opts.hasta || '2027-12-31').slice(0, 10);
  const today = baDateKey(now);
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const out = [];

  for (const [id, obra] of Object.entries(data.espectaculos || {})) {
    const clas = Object.values(obra.clasificaciones || {}).map((c) => c.descripcion);
    const url = obra.url ? new URL(obra.url, 'https://www.alternativateatral.com/').href : baseUrl;
    const image = obra.imagen_ficha ? `https://${obra.imagen_ficha.replace(/^https?:\/\//, '')}` : null;
    const infantil = clas.some((c) => /niñ|infantil|famil/i.test(c));
    const musica = clas.some((c) => /música|musica|recital|concierto|banda/i.test(c)) && !clas.includes('Teatro');

    for (const lugar of Object.values(obra.lugares || {})) {
      // Ubicación: provincia y localidad que informa el sitio; fuera del país o streaming, afuera
      // En Alternativa "Buenos Aires" es la provincia (a la Ciudad la llama "CABA")
      const provincia = /^buenos aires$/i.test(String(lugar.provincia || '').trim()) ? 'Provincia de Buenos Aires' : lugar.provincia;
      const u = ubicar({ ciudad: lugar.zona, provincia, pais: lugar.pais });
      if (!u || /streaming|online/i.test(`${lugar.nombre} ${lugar.direccion}`)) continue;
      const funs = Object.values(lugar.funciones || {});
      if (!funs.length) continue;
      // Horario de la temporada: "Lun 19:00 y 21:30 · Sáb 20:00"
      const porDia = new Map();
      for (const f of funs) {
        const d = (Number(f.nro_dia) - 1 + 7) % 7;
        if (!porDia.has(d)) porDia.set(d, new Set());
        if (f.hora) porDia.get(d).add(f.hora);
      }
      const horario = [...porDia].sort((x, y) => ((x[0] + 6) % 7) - ((y[0] + 6) % 7))
        .map(([d, hs]) => `${DIAS[d]} ${[...hs].sort().join(' y ')}`).join(' · ');
      const fin = funs.map((f) => f.fecha_hasta).sort().pop();
      const limite = fin < hasta ? fin : hasta;
      for (let i = 0, key = today; key <= limite && i < 800; i++, key = addDays(today, i)) {
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
          whenText: horario ? `${horario} h` : null,
          place: lugar.nombre,
          address: [lugar.direccion, u.provincia === 'CABA' ? lugar.zona : null].filter(Boolean).join(', '),
          provincia: u.provincia,
          zona: u.zona,
          localidad: u.localidad,
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
