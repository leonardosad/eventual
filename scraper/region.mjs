// Ubicación de cada evento en el país: provincia (las 24 jurisdicciones), zona
// ('CABA' | 'GBA' | null para el resto) y localidad para mostrar.
// Se aplica a campos de LOCALIDAD/PROVINCIA que informan las fuentes, nunca a
// direcciones completas: "Moreno 364" o "Florida 100" son calles de CABA.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const PROVINCIAS = ['CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];
const PROV_NORM = new Map(PROVINCIAS.map((p) => [norm(p), p]));

const CABA_TXT = /^(caba|c\.a\.b\.a\.?|capital federal|capital|ciudad (autonoma )?de buenos aires|ciudad de bs\.? ?as\.?|bs\.? ?as\.?|buenos aires)$/;

// Barrios porteños (y nombres de zona que usan las ticketeras)
const BARRIOS = new RegExp('^(barrio )?(' + [
  'agronomia', 'almagro', 'balvanera', 'barracas', 'belgrano', 'boedo', 'caballito', 'chacarita', 'coghlan', 'colegiales',
  'constitucion', 'flores', 'floresta', 'la boca', 'boca', 'la paternal', 'paternal', 'liniers', 'mataderos', 'monte castro',
  'monserrat', 'montserrat', 'nueva pompeya', 'pompeya', 'nunez', 'palermo', 'palermo soho', 'palermo hollywood', 'parque avellaneda',
  'parque chacabuco', 'parque chas', 'parque patricios', 'puerto madero', 'recoleta', 'retiro', 'saavedra', 'san cristobal',
  'san nicolas', 'san telmo', 'velez sarsfield', 'versalles', 'villa crespo', 'villa del parque', 'villa devoto', 'devoto',
  'villa general mitre', 'villa lugano', 'lugano', 'villa luro', 'villa ortuzar', 'villa pueyrredon', 'villa real',
  'villa riachuelo', 'villa santa rita', 'villa soldati', 'villa urquiza', 'abasto', 'microcentro', 'centro', 'once',
  'congreso', 'tribunales',
].join('|') + ')$');

// Partidos del GBA (24 del conurbano + Escobar y Pilar) y sus localidades más comunes
const GBA = new RegExp('\\b(' + [
  'gba', 'gran buenos aires', 'conurbano',
  'avellaneda', 'sarandi', 'wilde', 'dock sud', 'gerli', 'villa dominico',
  'lanus', 'remedios de escalada', 'valentin alsina',
  'lomas de zamora', 'banfield', 'temperley', 'turdera', 'llavallol',
  'quilmes', 'bernal', 'ezpeleta', 'don bosco',
  'berazategui', 'hudson', 'florencio varela',
  'almirante brown', 'adrogue', 'burzaco', 'longchamps', 'jose marmol', 'rafael calzada', 'claypole',
  'esteban echeverria', 'monte grande', 'luis guillon', 'canning', 'ezeiza', 'tristan suarez',
  'la matanza', 'san justo', 'ramos mejia', 'laferrere', 'isidro casanova', 'gonzalez catan', 'villa luzuriaga', 'tapiales',
  'villa madero', 'ciudad evita', 'lomas del mirador',
  'moron', 'castelar', 'haedo', 'el palomar', 'palomar', 'lomas del palomar', 'lomas de palomar', 'villa sarmiento', 'ciudad jardin', 'jardin lomas de palomar',
  'hurlingham', 'william morris', 'villa tesei', 'ituzaingo',
  'merlo', 'padua', 'san antonio de padua', 'moreno', 'paso del rey',
  'tres de febrero', 'caseros', 'ciudadela', 'santos lugares', 'saenz pena', 'villa bosch', 'martin coronado', 'loma hermosa',
  'general san martin', 'gral\\.? san martin', 'san martin', 'villa ballester', 'san andres', 'villa lynch', 'billinghurst',
  'san miguel', 'bella vista', 'muniz', 'jose c\\.? paz', 'malvinas argentinas', 'los polvorines', 'grand bourg',
  'tigre', 'don torcuato', 'general pacheco', 'el talar', 'benavidez', 'nordelta', 'rincon de milberg',
  'san fernando', 'victoria', 'virreyes',
  'san isidro', 'beccar', 'martinez', 'acassuso', 'boulogne', 'villa adelina',
  'vicente lopez', 'olivos', 'florida oeste', 'munro', 'villa martelli', 'carapachay', 'la lucila',
  'escobar', 'belen de escobar', 'garin', 'maschwitz', 'ingeniero maschwitz', 'pilar', 'del viso',
].join('|') + ')\\b');

// Ciudades del resto del país → provincia. Va antes que el GBA para que
// "San Andrés de Giles" o "San Martín de los Andes" no se confundan.
const CIUDADES = [
  ['Buenos Aires', ['la plata', 'mar del plata', 'bahia blanca', 'tandil', 'junin', 'pinamar', 'villa gesell', 'necochea', 'olavarria',
    'azul', 'lujan', 'campana', 'zarate', 'san nicolas de los arroyos', 'pergamino', 'chascomus', 'san andres de giles',
    'general rodriguez', 'canuelas', 'brandsen', 'exaltacion de la cruz', 'mar de ajo', 'san clemente del tuyu', 'miramar',
    'tres arroyos', 'chivilcoy', 'ensenada', 'berisso', 'city bell', 'gonnet', 'cariló', 'carilo', 'villa gesel', 'san pedro',
    'baradero', 'tigre delta', 'costa del este', 'santa teresita', 'balcarce', 'bragado', 'nueve de julio', '9 de julio']],
  ['Córdoba', ['cordoba', 'villa carlos paz', 'carlos paz', 'rio cuarto', 'villa maria', 'alta gracia', 'cosquin', 'jesus maria', 'la falda']],
  ['Santa Fe', ['rosario', 'santa fe', 'santa fe de la vera cruz', 'rafaela', 'venado tuerto', 'reconquista', 'funes']],
  ['Mendoza', ['mendoza', 'godoy cruz', 'guaymallen', 'lujan de cuyo', 'san rafael', 'las heras', 'maipu']],
  ['San Juan', ['san juan', 'pocito', 'rivadavia']],
  ['Tucumán', ['tucuman', 'san miguel de tucuman', 'yerba buena', 'tafi del valle']],
  ['Salta', ['salta', 'cafayate']],
  ['Jujuy', ['jujuy', 'san salvador de jujuy', 'purmamarca', 'tilcara']],
  ['Neuquén', ['neuquen', 'san martin de los andes', 'villa la angostura', 'junin de los andes']],
  ['Río Negro', ['bariloche', 'san carlos de bariloche', 'general roca', 'viedma', 'cipolletti', 'el bolson']],
  ['Entre Ríos', ['parana', 'concordia', 'gualeguaychu', 'colon entre rios', 'victoria entre rios']],
  ['Corrientes', ['corrientes', 'goya']],
  ['Misiones', ['posadas', 'obera', 'puerto iguazu', 'iguazu']],
  ['Chaco', ['resistencia', 'chaco']],
  ['Formosa', ['formosa']],
  ['Santiago del Estero', ['santiago del estero', 'termas de rio hondo']],
  ['Catamarca', ['catamarca', 'san fernando del valle de catamarca']],
  ['La Rioja', ['la rioja']],
  ['San Luis', ['san luis', 'villa mercedes', 'merlo san luis']],
  ['La Pampa', ['la pampa', 'santa rosa', 'general pico']],
  ['Chubut', ['chubut', 'comodoro rivadavia', 'trelew', 'puerto madryn', 'rawson', 'esquel', 'lago puelo', 'el hoyo']],
  ['Santa Cruz', ['rio gallegos', 'el calafate', 'caleta olivia']],
  ['Tierra del Fuego', ['ushuaia', 'rio grande']],
];
const CIUDAD_PROV = new Map(CIUDADES.flatMap(([p, cs]) => cs.map((c) => [c, p])));
const EXTRANJERO = /\b(montevideo|punta del este|uruguay|santiago de chile|chile|asuncion|paraguay|brasil|sao paulo|rio de janeiro|planeta tierra|online|streaming)\b/;

export function provinciaCanonica(p) {
  const v = norm(p).replace(/^(provincia de|prov\.?( de)?|pcia\.?( de)?)\s+/, '').replace(/\bfe\b/, 'fe');
  if (!v) return null;
  if (/^(caba|capital federal|ciudad (autonoma )?de buenos aires|c\.a\.b\.a\.?)$/.test(v)) return 'CABA';
  return PROV_NORM.get(v) || PROV_NORM.get(v.replace('santa fe', 'santa fe')) || null;
}

/** Nombre prolijo de la localidad para mostrar ("Lomas de Zamora"). */
export function localidadDe(text) {
  const v = String(text || '').trim();
  if (!v || CABA_TXT.test(norm(v))) return null;
  return v.replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\s(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase());
}

/**
 * Ubica un evento a partir de la ciudad/localidad y la provincia que informa la fuente.
 * Devuelve { provincia, zona, localidad } o null si es del exterior.
 * `ambiguo`: qué hacer con "Buenos Aires" sin más datos ('CABA' por defecto).
 */
export function ubicar({ ciudad = '', provincia = '', pais = '' } = {}, { ambiguo = 'CABA' } = {}) {
  const c = norm(ciudad).replace(/^(ciudad de|cdad\.?( de)?)\s+/, '');
  const pRaw = norm(provincia);
  if (pais && !/argentina/.test(norm(pais))) return null;
  if (EXTRANJERO.test(c) || EXTRANJERO.test(pRaw)) return null;
  const prov = provinciaCanonica(provincia);

  if (prov === 'CABA') return { provincia: 'CABA', zona: 'CABA', localidad: null };
  if (c && (!prov || prov === 'Buenos Aires') && (BARRIOS.test(c) || (CABA_TXT.test(c) && !/provincia/.test(pRaw)))) {
    return { provincia: 'CABA', zona: 'CABA', localidad: null };
  }
  if (c && CIUDAD_PROV.has(c)) {
    const p = CIUDAD_PROV.get(c);
    if (!prov || prov === p || prov === 'Buenos Aires' && p === 'Buenos Aires') return { provincia: p, zona: null, localidad: localidadDe(ciudad) };
  }
  if (c && GBA.test(c) && (!prov || prov === 'Buenos Aires')) return { provincia: 'Buenos Aires', zona: 'GBA', localidad: localidadDe(ciudad) };
  if (c) {
    // Ciudad conocida dentro de un nombre más largo ("Hipódromo de La Plata")
    for (const [k, p] of CIUDAD_PROV) if (k.length > 4 && new RegExp(`\\b${k}\\b`).test(c) && (!prov || prov === p)) return { provincia: p, zona: null, localidad: localidadDe(k) };
  }
  if (prov && prov !== 'Buenos Aires') return { provincia: prov, zona: null, localidad: c ? localidadDe(ciudad) : null };
  if (prov === 'Buenos Aires') {
    if (!c) return /provincia/.test(pRaw) ? { provincia: 'Buenos Aires', zona: null, localidad: null } : (ambiguo === 'CABA' ? { provincia: 'CABA', zona: 'CABA', localidad: null } : { provincia: 'Buenos Aires', zona: null, localidad: null });
    return { provincia: 'Buenos Aires', zona: null, localidad: localidadDe(ciudad) };
  }
  if (!c) return ambiguo === 'CABA' ? { provincia: 'CABA', zona: 'CABA', localidad: null } : null;
  return { provincia: null, zona: null, localidad: localidadDe(ciudad) };
}

/** Compatibilidad: 'CABA', 'GBA' o null. */
export function zonaDe(...localidades) {
  for (const l of localidades.flat()) {
    const u = ubicar({ ciudad: l }, { ambiguo: 'nada' });
    if (u?.zona) return u.zona;
    if (u?.provincia && u.provincia !== 'CABA') return null;
  }
  return null;
}
