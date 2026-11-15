// Plateanet (plateanet.com): ticketera de muchas salas de la calle Corrientes y del GBA
// (Teatro Premier, Astral, Apolo, Metropolitan, etc.). Su API interna rechaza pedidos
// directos, pero responde a la propia página: se abre con el navegador automático y se
// toman las respuestas de obtenerobrasencartel2 (obras con sus funciones) y getTeatros (salas).
import { captureResponses } from './rendered.mjs';
import { ubicar } from '../region.mjs';

const clean = (s) => String(s || '').replace(/&lt;\|&gt;|<\|>/g, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\s(De|Del|La|Las|Los|Y|El)\b/g, (m) => m.toLowerCase());

const CATS = { RECITAL: 'Música', INFANTILES: 'Infantil', INFANTIL: 'Infantil', 'STAND UP': 'Teatro', COMEDIA: 'Teatro',
  'COMEDIA DRAMATICA': 'Teatro', 'COMEDIA DRAMÁTICA': 'Teatro', DRAMA: 'Teatro', MUSICAL: 'Teatro' };

// cZona: "CABA", "GBA Norte/Sur/Oeste", "Mar del Plata", "La Plata", "Junín", "Villa Carlos Paz",
// "La Pampa", "Prov. Buenos Aires"…
export function ubicarPlateanet(cZona, localidadDireccion) {
  const z = String(cZona || '').trim();
  if (/^caba$/i.test(z)) return { provincia: 'CABA', zona: 'CABA', localidad: null };
  if (/^gba/i.test(z)) {
    const u = ubicar({ ciudad: localidadDireccion }, { ambiguo: 'nada' });
    return { provincia: 'Buenos Aires', zona: 'GBA', localidad: u?.localidad || localidadDireccion || null };
  }
  if (/^prov\.? ?buenos aires$/i.test(z)) {
    const u = ubicar({ ciudad: localidadDireccion, provincia: 'Provincia de Buenos Aires' });
    return u || { provincia: 'Buenos Aires', zona: null, localidad: localidadDireccion || null };
  }
  return ubicar({ ciudad: z }, { ambiguo: 'nada' }) || ubicar({ provincia: z }, { ambiguo: 'nada' });
}

export function parsePlateanet(obrasJson, teatrosJson, baseUrl) {
  const obras = JSON.parse(obrasJson);
  let teatros = [];
  try { const t = JSON.parse(teatrosJson || '{}'); teatros = t.objeto || t.data || (Array.isArray(t) ? t : []); } catch { /* sin salas */ }
  const salas = new Map(teatros.map((t) => [String(t.Id), t]));
  const out = [];
  for (const o of Array.isArray(obras) ? obras : []) {
    const sala = salas.get(String(o.cTeatroID));
    const nombre = titleCase(sala?.Name || o.cTeatroNombre);
    const tipo = sala?.cTipo || 'Teatro';
    const place = /(teatro|sala|auditorio|centro|club|espacio|complejo|multi|cine|anfiteatro)/i.test(nombre) || /^(la|el) /i.test(nombre) ? nombre : `${tipo} ${nombre}`;
    // Dirección sin "Provincia de Buenos Aires", "Buenos Aires" ni "Argentina" al final
    const partes = String(sala?.Direccion || '').split(',').map((p) => p.trim()).filter(Boolean);
    while (partes.length > 1 && /^(argentina|(provincia de |prov\.? )?buenos aires|bs\.? ?as\.?|caba|c\.?p\.? ?\d+|\d{4})$/i.test(partes[partes.length - 1])) partes.pop();
    const direccion = partes.join(', ');
    // Localidad para el GBA: la última parte que queda ("Calle 123, Lomas de Zamora")
    const u = ubicarPlateanet(o.cZona, partes.length > 1 ? partes[partes.length - 1] : '');
    if (!u?.provincia) continue;
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
        provincia: u.provincia,
        zona: u.zona,
        localidad: u.localidad,
        baseUrl,
      });
    }
  }
  return out;
}

export async function plateanet(body, url) {
  // La lista de obras pesa ~800 KB y a veces tarda: hasta dos intentos de 90 segundos
  let r = {};
  for (let intento = 0; intento < 2 && !r.obtenerobrasencartel2; intento++) {
    r = await captureResponses(url, ['obtenerobrasencartel2', 'getTeatros'], 90_000);
  }
  if (!r.obtenerobrasencartel2) throw new Error('la página no cargó las obras después de dos intentos');
  return parsePlateanet(r.obtenerobrasencartel2, r.getTeatros, url);
}
