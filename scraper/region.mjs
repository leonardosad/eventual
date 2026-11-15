// Zonas: CABA y Gran Buenos Aires (los 24 partidos del conurbano más Escobar y Pilar).
// Se aplica solo a campos de LOCALIDAD (ciudad, partido, zona), nunca a direcciones
// completas: "Moreno 364" o "Florida 100" son calles de CABA.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const CABA = /^(caba|c\.a\.b\.a\.?|capital federal|capital|ciudad (autonoma )?de buenos aires|buenos aires|bs\.? ?as\.?|ciudad de bs\.? ?as\.?)$/;

// Barrios porteños (y nombres de zona que usan las ticketeras)
const BARRIOS = new RegExp('\\b(' + [
  'agronomia', 'almagro', 'balvanera', 'barracas', 'belgrano', 'boedo', 'caballito', 'chacarita', 'coghlan', 'colegiales',
  'constitucion', 'flores', 'floresta', 'la boca', 'boca', 'la paternal', 'paternal', 'liniers', 'mataderos', 'monte castro',
  'monserrat', 'montserrat', 'nueva pompeya', 'pompeya', 'nunez', 'palermo', 'parque avellaneda', 'parque chacabuco', 'parque chas',
  'parque patricios', 'puerto madero', 'recoleta', 'retiro', 'saavedra', 'san cristobal', 'san nicolas', 'san telmo',
  'velez sarsfield', 'versalles', 'villa crespo', 'villa del parque', 'villa devoto', 'devoto', 'villa general mitre',
  'villa lugano', 'lugano', 'villa luro', 'villa ortuzar', 'villa pueyrredon', 'villa real', 'villa riachuelo',
  'villa santa rita', 'villa soldati', 'villa urquiza', 'abasto', 'microcentro', 'centro', 'once', 'congreso', 'tribunales',
].join('|') + ')\\b');

// Partidos del GBA y sus localidades más comunes
const GBA = new RegExp('\\b(' + [
  'gba', 'gran buenos aires', 'conurbano',
  'avellaneda', 'sarandi', 'wilde', 'dock sud', 'gerli', 'villa dominico',
  'lanus', 'remedios de escalada', 'valentin alsina',
  'lomas de zamora', 'banfield', 'temperley', 'turdera', 'llavallol',
  'quilmes', 'bernal', 'ezpeleta', 'don bosco',
  'berazategui', 'hudson', 'florencio varela',
  'almirante brown', 'adrogue', 'burzaco', 'longchamps', 'jose marmol', 'rafael calzada', 'claypole',
  'esteban echeverria', 'monte grande', 'luis guillon', 'canning', 'ezeiza', 'tristan suarez',
  'la matanza', 'san justo', 'ramos mejia', 'laferrere', 'isidro casanova', 'gonzalez catan', 'villa luzuriaga', 'tapiales', 'villa madero', 'ciudad evita', 'lomas del mirador',
  'moron', 'castelar', 'haedo', 'el palomar', 'villa sarmiento',
  'hurlingham', 'william morris', 'villa tesei', 'ituzaingo',
  'merlo', 'padua', 'san antonio de padua', 'moreno', 'paso del rey',
  'tres de febrero', 'caseros', 'ciudadela', 'santos lugares', 'saenz pena', 'villa bosch', 'martin coronado', 'loma hermosa',
  'general san martin', 'gral\\.? san martin', 'villa ballester', 'san andres', 'villa lynch', 'billinghurst',
  'san miguel', 'bella vista', 'muniz', 'jose c\\.? paz', 'malvinas argentinas', 'los polvorines', 'grand bourg',
  'tigre', 'don torcuato', 'general pacheco', 'el talar', 'benavidez', 'nordelta', 'rincon de milberg',
  'san fernando', 'victoria', 'virreyes',
  'san isidro', 'beccar', 'martinez', 'acassuso', 'boulogne', 'villa adelina',
  'vicente lopez', 'olivos', 'florida oeste', 'munro', 'villa martelli', 'carapachay', 'la lucila', 'villa adelina',
  'escobar', 'belen de escobar', 'garin', 'maschwitz', 'pilar', 'del viso',
].join('|') + ')\\b');

// Lugares que NO son AMBA (se descartan aunque la fuente diga "Provincia de Buenos Aires")
const LEJOS = /\b(la plata|san andres de giles|general rodriguez|canuelas|brandsen|exaltacion de la cruz|mar del plata|bahia blanca|junin|tandil|pinamar|villa gesell|necochea|olavarria|azul|lujan|campana|zarate|san nicolas de los arroyos|pergamino|chascomus|cordoba|rosario|santa fe|mendoza|tucuman|salta|jujuy|neuquen|bariloche|san juan|la pampa|villa carlos paz|montevideo|santiago|chubut|corrientes|misiones|parana|entre rios)\b/;

/**
 * Devuelve 'CABA', 'GBA' o null (fuera del AMBA o desconocido) a partir de campos
 * de localidad. Recibe uno o varios textos (ciudad, partido, zona, región).
 */
export function zonaDe(...localidades) {
  const vals = localidades.flat().map(norm).filter(Boolean);
  if (!vals.length) return null;
  if (vals.some((v) => LEJOS.test(v))) return null;
  if (vals.some((v) => CABA.test(v) || BARRIOS.test(v))) return 'CABA';
  if (vals.some((v) => GBA.test(v))) return 'GBA';
  if (vals.some((v) => CABA.test(v) || /capital federal|ciudad (autonoma )?de buenos aires|\bcaba\b/.test(v))) return 'CABA';
  return null;
}

/** Nombre prolijo de la localidad para mostrar ("Lomas de Zamora"). */
export function localidadDe(text) {
  const v = String(text || '').trim();
  if (!v || CABA.test(norm(v))) return null;
  return v.replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\s(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase());
}
