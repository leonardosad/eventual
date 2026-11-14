// Plateanet (plateanet.com): ticketera de muchas salas de la calle Corrientes y del GBA
// (Teatro Premier, Astral, Apolo, Metropolitan, etc.). Su API interna rechaza pedidos
// directos, pero responde a la propia página: se abre con el navegador automático y se
// toman las respuestas de obtenerobrasencartel2 (obras con sus funciones) y getTeatros (salas).
import { captureResponses } from './rendered.mjs';
import { localidadDe } from '../region.mjs';

const clean = (s) => String(s || '').replace(/&lt;\|&gt;|<\|>/g, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\s(De|Del|La|Las|Los|Y|El)\b/g, (m) => m.toLowerCase());

const CATS = { RECITAL: 'Música', INFANTILES: 'Infantil', INFANTIL: 'Infantil', 'STAND UP': 'Teatro', COMEDIA: 'Teatro',
  'COMEDIA DRAMATICA': 'Teatro', 'COMEDIA DRAMÁTICA': 'Teatro', DRAMA: 'Teatro', MUSICAL: 'Teatro' };

export function zonaPlateanet(z) {
  if (/^caba$/i.test(z)) return 'CABA';
  if (/^gba/i.test(z)) return 'GBA';
  return null; // Mar del Plata, La Plata, Junín, "Prov. Buenos Aires", etc.
}

export function parsePlateanet(obrasJson, teatrosJson, baseUrl) {
  const obras = JSON.parse(obrasJson);
  let teatros = [];
  try { const t = JSON.parse(teatrosJson || '{}'); teatros = t.objeto || t.data || (Array.isArray(t) ? t : []); } catch { /* sin salas */ }
  const salas = new Map(teatros.map((t) => [String(t.Id), t]));
  const out = [];
  for (const o of Array.isArray(obras) ? obras : []) {
    const zona = zonaPlateanet(o.cZona);
    if (!zona) continue;
    const sala = salas.get(String(o.cTeatroID));
    const nombre = titleCase(sala?.Name || o.cTeatroNombre);
    const tipo = sala?.cTipo || 'Teatro';
    const place = /(teatro|sala|auditorio|centro|club|espacio|complejo|multi|cine|anfiteatro)/i.test(nombre) || /^(la|el) /i.test(nombre) ? nombre : `${tipo} ${nombre}`;
    const direccion = String(sala?.Direccion || '').replace(/,\s*(Buenos Aires,\s*)?Argentina$/i, '').trim();
    // Localidad para el GBA: la última parte de la dirección ("Calle 123, Lomas de Zamora")
    const partes = direccion.split(',').map((p) => p.trim()).filter(Boolean);
    const localidad = zona === 'GBA' ? localidadDe(partes.length > 1 ? partes[partes.length - 1] : o.cZona.replace(/^GBA\s*/i, 'GBA ')) : null;
    for (const fecha of o.cFechas || []) {
      out.push({
        title: titleCase(o.cNombre).replace(/\s+-\s+/g, ' – '),
        start: String(fecha).replace(/^[^,]*,\s*/, ''), // "12 diciembre 2026 21:00"
        place,
        address: partes.length > 1 ? partes.slice(0, -1).join(', ') : direccion || null,
        description: clean(o.cDescripcion).slice(0, 300),
        image: o.cImagenBusqueda || o.cImagenCompra,
        url: o.cUrl,
        category: CATS[String(o.cCategoria || '').toUpperCase()],
        zona,
        localidad,
        baseUrl,
      });
    }
  }
  return out;
}

export async function plateanet(body, url) {
  const r = await captureResponses(url, ['obtenerobrasencartel2', 'getTeatros']);
  if (!r.obtenerobrasencartel2) throw new Error('la página no cargó las obras (¿cambió el sitio?)');
  return parsePlateanet(r.obtenerobrasencartel2, r.getTeatros, url);
}
