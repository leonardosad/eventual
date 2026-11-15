// Pruebas con páginas de ejemplo (no necesitan internet): npm test
import assert from 'node:assert/strict';
import { parseAuto } from './adapters/jsonld.mjs';
import { parseHtml } from './adapters/html.mjs';
import { parseIcal } from './adapters/ical.mjs';
import { parseAlternativa } from './adapters/alternativa.mjs';
import { parseTurismoBA, weekRange } from './adapters/turismoba.mjs';
import { follow } from './adapters/follow.mjs';
import { eventsFromNode, showsFromSearch } from './adapters/ticketek.mjs';
import { parseComplejoDay } from './adapters/complejo.mjs';
import { parseArtMedia } from './adapters/artmedia.mjs';
import { parseNiceto } from './adapters/niceto.mjs';
import { parseEnigma } from './adapters/enigma.mjs';
import { parseBebop, parseLivepass, livepassZona } from './adapters/jazz.mjs';
import { zonaDe, ubicar } from './region.mjs';
import { parsePlateanet } from './adapters/plateanet.mjs';
import { parseFestivalear, rangoFestivalear } from './adapters/festivalear.mjs';
import { parseTuEntrada, eventsFromVenueApi, tuentradaSearch } from './adapters/tuentrada.mjs';
import { normalizeEvent, dedupe, parseDate, categorize, agrupar, rangoDesdeTexto } from './normalize.mjs';

const now = new Date('2026-11-07T12:00:00-03:00');
const src = { id: 'test', name: 'Test' };
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`✓ ${name}`); };
const testAsync = async (name, fn) => { await fn(); passed++; console.log(`✓ ${name}`); };

test('parseDate: formatos comunes', () => {
  assert.equal(parseDate('2026-11-08T21:00:00-03:00'), '2026-11-08T21:00:00-03:00');
  assert.equal(parseDate('2026-11-09T00:30:00Z'), '2026-11-08T21:30:00-03:00');
  assert.equal(parseDate('2026-11-08T20:00'), '2026-11-08T20:00:00-03:00');
  assert.equal(parseDate('08/11/2026 20:30'), '2026-11-08T20:30:00-03:00');
  assert.equal(parseDate('Sábado 8 de noviembre, 21 hs', now), '2026-11-08T21:00:00-03:00');
  assert.equal(parseDate('15 dic', now), '2026-12-15T00:00:00-03:00');
  assert.equal(parseDate('10 de enero', now), '2027-01-10T00:00:00-03:00');
});

test('categorize', () => {
  assert.equal(categorize('Recital de rock en Niceto'), 'Música');
  assert.equal(categorize('Milonga al aire libre'), 'Tango');
  assert.equal(categorize('Taller de cerámica'), 'Talleres y charlas');
});

test('JSON-LD con ItemList (estilo Eventbrite)', () => {
  const html = `<html><head><script type="application/ld+json">
  {"@context":"https://schema.org","@type":"ItemList","itemListElement":[
    {"@type":"ListItem","position":1,"item":{"@type":"MusicEvent","name":"Jazz en San Telmo",
     "startDate":"2026-11-08T21:00:00-03:00","url":"https://ej.com/jazz",
     "location":{"@type":"Place","name":"Bar Ejemplo","address":{"streetAddress":"Defensa 100","addressLocality":"CABA"}},
     "offers":{"@type":"Offer","price":"5000","priceCurrency":"ARS"}}},
    {"@type":"ListItem","position":2,"item":{"@type":"Event","name":"Feria del libro usado",
     "startDate":"2026-11-09","isAccessibleForFree":true,"location":"Plaza Italia"}}
  ]}</script></head></html>`;
  const raw = parseAuto(html, 'https://ej.com/agenda');
  assert.equal(raw.length, 2);
  const [a, b] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.place, 'Bar Ejemplo');
  assert.equal(a.price, '$5.000');
  assert.equal(a.category, 'Música');
  assert.equal(b.free, true);
  assert.equal(b.price, 'Gratis');
  assert.equal(b.category, 'Ferias');
});

test('JSON-LD con @graph y tipo en arreglo', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},
    {"@type":["TheaterEvent"],"name":"Obra X","startDate":"2026-11-10T20:00","image":["/img.jpg"]}]}</script>`;
  const [e] = parseAuto(html, 'https://teatro.com/cartelera').map((r) => normalizeEvent(r, src, now));
  assert.equal(e.image, 'https://teatro.com/img.jpg');
  assert.equal(e.category, 'Teatro');
});

test('Microdatos', () => {
  const html = `<div itemscope itemtype="https://schema.org/Event">
    <span itemprop="name">Cine debate</span><meta itemprop="startDate" content="2026-11-12T19:00">
    <a itemprop="url" href="/cine">ver</a></div>`;
  const [e] = parseAuto(html, 'https://cc.com/').map((r) => normalizeEvent(r, src, now));
  assert.equal(e.title, 'Cine debate');
  assert.equal(e.url, 'https://cc.com/cine');
});

test('HTML con selectores', () => {
  const html = `<ul><li class="ev"><h3>Muestra de fotografía</h3><time datetime="2026-11-14">14/11</time>
    <a href="/m">+</a><span class="lugar">Centro Cultural Recoleta</span><span class="p">Entrada libre</span></li></ul>`;
  const raw = parseHtml(html, 'https://cc.com/agenda', { item: '.ev', title: 'h3', date: 'time', place: '.lugar', price: '.p' });
  const [e] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(e.start, '2026-11-14T00:00:00-03:00');
  assert.equal(e.free, true);
  assert.equal(e.category, 'Arte y muestras');
});

test('iCal', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Charla abierta\\, entrada libre\r\nDTSTART;TZID=America/Argentina/Buenos_Aires:20261115T180000\r\nLOCATION:Biblioteca Nacional\r\nURL:https://bn.gob.ar/x\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const [e] = parseIcal(ics, 'https://bn.gob.ar/cal.ics').map((r) => normalizeEvent(r, src, now));
  assert.equal(e.title, 'Charla abierta, entrada libre');
  assert.equal(e.start, '2026-11-15T18:00:00-03:00');
  assert.equal(e.free, true);
});

test('dedupe une fuentes', () => {
  const a = normalizeEvent({ title: 'Jazz en San Telmo', start: '2026-11-08T21:00' }, { id: 'a', name: 'A' }, now);
  const b = normalizeEvent({ title: 'JAZZ en San Telmo ', start: '2026-11-08T22:00', place: 'Bar' }, { id: 'b', name: 'B' }, now);
  const out = dedupe([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sources.length, 2);
  assert.equal(out[0].place, 'Bar');
});

test('Alternativa Teatral: expande funciones semanales', () => {
  const now2 = new Date('2026-11-09T12:00:00-03:00'); // lunes
  const body = 'jsoncallback(﻿' + JSON.stringify({ espectaculos: {
    99976: { titulo: 'Las adoro', imagen_ficha: 'img.alternativateatral.com/x.jpg', url: 'obra99976-las-adoro',
      clasificaciones: { 1: { descripcion: 'Teatro' }, 28: { descripcion: 'Adultos' } },
      lugares: { 3426: { nombre: 'EL GALPÓN DE GUEVARA', direccion: 'Guevara 326', zona: 'Chacarita', provincia: 'CABA',
        funciones: {
          a: { nro_dia: 2, hora: '19:00', fecha_desde: '2026-11-02', fecha_hasta: '2026-11-30' },
          b: { nro_dia: 2, hora: '21:30', fecha_desde: '2026-11-02', fecha_hasta: '2026-11-30' },
        } } } },
    5: { titulo: 'Obra en La Plata', url: 'obra5', clasificaciones: {},
      lugares: { 1: { nombre: 'Sala', provincia: 'Buenos Aires', funciones: { a: { nro_dia: 2, hora: '20:00', fecha_desde: '2026-11-01', fecha_hasta: '2026-12-01' } } } } },
  }, codigos: [] }) + ')';
  const raw = parseAlternativa(body, 'https://www.alternativateatral.com/get-json.php', {}, now2);
  // Las adoro: lunes 9, 16, 23 y 30 de noviembre; la de La Plata: 4 lunes más (todo el país)
  assert.equal(raw.length, 8);
  const ev = raw.map((r) => normalizeEvent(r, src, now2));
  const e = ev.find((x) => x.title === 'Las adoro');
  assert.equal(e.start, '2026-11-09T19:00:00-03:00');
  assert.equal(e.whenText, 'Lun 19:00 y 21:30 h');
  assert.equal(e.place, 'EL GALPÓN DE GUEVARA');
  assert.equal(e.provincia, 'CABA');
  assert.equal(e.url, 'https://www.alternativateatral.com/obra99976-las-adoro');
  assert.equal(e.image, 'https://img.alternativateatral.com/x.jpg');
  assert.equal(e.category, 'Teatro');
  const lp = ev.find((x) => x.title === 'Obra en La Plata');
  assert.equal(lp.provincia, 'Buenos Aires');
  assert.equal(lp.zona, null);
  // Agrupadas: una tarjeta por obra con sus funciones
  const g = agrupar(ev);
  assert.equal(g.length, 2);
  const ga = g.find((x) => x.title === 'Las adoro');
  assert.equal(ga.fechas.length, 4);
  assert.equal(ga.end, '2026-11-30T19:00:00-03:00');
});

test('Turismo BA: semana del encabezado + texto ¿Cuándo?', () => {
  const html = `<body><p>Desde el lunes 9 de noviembre al domingo 15 de noviembre</p>
    <script type="application/ld+json">[{"@context":"https://schema.org","@type":"Event","name":"arteba","startDate":"2026-10-30",
      "url":"https://turismo.buenosaires.gob.ar/es/article/arteba","location":{"@type":"Place","name":"La Rural"}},
      {"@type":"Event","name":"Noche de las Ánimas","startDate":"2026-10-21","offers":{"@type":"Offer","price":0}}]</script>
    <div class="panel panel-default panel-teaser"><h2>arteba</h2><div><p><b>¿Cuándo?</b></p><p>Del viernes 13 al domingo 15 de noviembre</p></div></div>
  </body>`;
  const raw = parseTurismoBA(html, 'https://turismo.buenosaires.gob.ar/x', now);
  assert.equal(raw.length, 2);
  const [a, b] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.start, '2026-11-09T00:00:00-03:00');
  assert.equal(a.end, '2026-11-15T23:59:00-03:00');
  assert.equal(a.whenText, 'Del viernes 13 al domingo 15 de noviembre');
  assert.equal(b.whenText, 'Esta semana');
  assert.equal(b.free, true);
  assert.deepEqual(weekRange('Desde el lunes 29 de diciembre al domingo 4 de enero', new Date('2027-01-01T12:00:00-03:00')),
    { start: '2026-12-29T00:00:00-03:00', end: '2027-01-04T23:59:00-03:00' });
});

const ctxFrom = (pages) => ({ fetch: async (u) => { if (!(u in pages)) throw new Error('404'); return pages[u]; }, warn: () => {} });

await testAsync('follow: sigue links y lee JSON-LD (AllAccess / Konex)', async () => {
  const list = `<a href="../event/airbag">x</a><a href="/event/fito-en-rosario">y</a><a href="/ayuda">z</a>`;
  const ld = (name, loc) => `<script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"2026-12-12T00:00:00Z",
    "location":{"@type":"Place","name":"${loc}","address":{"streetAddress":"Calle 1","addressLocality":"${loc === 'Estadio River Plate' ? 'CABA' : 'Rosario'}"}},
    "offers":[{"@type":"Offer","price":20000,"priceCurrency":"ARS"}]}</script>`;
  const ctx = ctxFrom({
    'https://www.allaccess.com.ar/event/airbag': ld('AIRBAG', 'Estadio River Plate'),
    'https://www.allaccess.com.ar/event/fito-en-rosario': ld('Fito', 'Anfiteatro'),
  });
  const src2 = { id: 'aa', name: 'AllAccess', linkPattern: 'allaccess\\.com\\.ar/event/', placeInclude: 'CABA|Capital Federal' };
  const raw = await follow(list, 'https://www.allaccess.com.ar/home/', src2, ctx);
  assert.equal(raw.length, 1);
  const e = normalizeEvent(raw[0], src2, now);
  assert.equal(e.title, 'AIRBAG');
  assert.equal(e.start, '2026-12-11T21:00:00-03:00');
  assert.equal(e.price, '$20.000');
});

test('Ticketek: datos del nodo', () => {
  const node = { category: { parent: 'Musica' }, google_structured_data: [{ '@type': 'MusicEvent', name: 'Tarja', startDate: '2026-12-01T21:00:00-03:00', endDate: '2026-12-01T21:00:00-03:00',
    location: { '@type': 'Place', name: 'Teatro Coliseo', address: { streetAddress: 'Marcelo T. de Alvear 1125', addressRegion: 'Capital Federal' } },
    offers: { price: '124300', priceCurrency: 'ARS', url: 'https://www.ticketek.com.ar/tarja/teatro-coliseo' } }] };
  const [e] = eventsFromNode(node, 'tarja/teatro-coliseo').map((r) => normalizeEvent(r, src, now));
  assert.equal(e.place, 'Teatro Coliseo');
  assert.equal(e.end, null);
  assert.equal(e.category, 'Música');
  assert.equal(e.price, '$124.300');
  const [t] = eventsFromNode({ category: { parent: 'Teatro' }, google_structured_data: [{ '@type': 'MusicEvent', name: 'Esperando a Godot', startDate: '2026-11-12T20:00:00-03:00' }] }, 'x/y');
  assert.equal(t.category, 'Teatro');
  const mdq = eventsFromNode({ google_structured_data: [{ '@type': 'MusicEvent', name: 'Show', startDate: '2026-12-01T21:00:00-03:00',
    location: { name: 'RADIO CITY', address: { addressRegion: 'Buenos Aires', addressLocality: 'Mar del Plata' } } }] }, 'a/b');
  assert.equal(mdq[0].provincia, 'Buenos Aires');
  assert.equal(mdq[0].zona, null);
  assert.equal(mdq[0].localidad, 'Mar del Plata');
  const pal = eventsFromNode({ google_structured_data: [{ '@type': 'MusicEvent', name: 'Show', startDate: '2026-12-01T21:00:00-03:00',
    location: { name: 'Hipódromo de Palermo', address: { addressRegion: 'Buenos Aires', addressLocality: 'Palermo' } } }] }, 'a/b');
  assert.equal(pal[0].zona, 'CABA');
  assert.equal(pal[0].provincia, 'CABA');
  assert.deepEqual(showsFromSearch({ resultados: [{ url: 'a/b' }, { url: 'c/d' }] }), ['a/b', 'c/d']);
});

test('Complejo Teatral: agenda del día', () => {
  const html = `<div class="small_item"><div class="background lozad" data-background-image="https://ctba/img.jpg"></div>
    <span class="category">opera rock</span><span class="place"> Sala Martín Coronado / Teatro San Martín </span>
    <h2>INVASIONES I</h2><span class="date">Miércoles a sábados, 20.30 horas. Domingos, 19.30 horas</span>
    <a class="button buy" href="https://entradasba/x">Comprar</a><a href="https://complejoteatral.gob.ar/produccion/invasiones/">+ info</a></div>`;
  const [e] = parseComplejoDay(html, '2026-11-12', 'https://complejoteatral.gob.ar/agenda/').map((r) => normalizeEvent(r, src, now));
  assert.equal(e.title, 'INVASIONES I');
  assert.equal(e.category, 'Música');
  assert.equal(e.whenText, 'Miércoles a sábados, 20.30 horas. Domingos, 19.30 horas');
  assert.equal(e.url, 'https://complejoteatral.gob.ar/produccion/invasiones/');
});

test('C Art Media: API', () => {
  const body = JSON.stringify({ statusCode: 200, body: JSON.stringify({ events: [
    { title: 'JORJA SMITH', subTitle: 'EN VIVO', day: '2026-11-11T00:00:00.000Z', hs: '19', type: 'Recitales', nave: 'Central', Publicado: 'si', linkPago: 'https://www.passline.com/eventos/jorja', imageUrl: 'https://centroc.s3/x.jpg' },
    { title: 'Borrador', day: '2026-11-20T00:00:00.000Z', hs: '21:30', Publicado: 'no' },
  ] }) });
  const raw = parseArtMedia(body, 'https://api');
  assert.equal(raw.length, 1);
  const e = normalizeEvent(raw[0], src, now);
  assert.equal(e.title, 'JORJA SMITH · EN VIVO');
  assert.equal(e.start, '2026-11-11T19:00:00-03:00');
  assert.equal(e.category, 'Música');
});

test('HTML con whenText (Movistar Arena)', () => {
  const html = `<div class="evento"><img src="https://m/a.jpg"><h3>María Becerra</h3><span class="fecha">13 noviembre 2026 y 8 fechas más</span>
    <span class="precio-desde">Desde $60.000</span><a href="/show/993a" class="mas-info">Más info</a></div>`;
  const sel = { item: '.evento', title: 'h3', date: '.fecha', whenText: '.fecha', link: 'a.mas-info', price: '.precio-desde' };
  const [e] = parseHtml(html, 'https://www.movistararena.com.ar/shows', sel).map((r) => normalizeEvent(r, src, now));
  assert.equal(e.start, '2026-11-13T00:00:00-03:00');
  assert.equal(e.whenText, '13 noviembre 2026 y 8 fechas más');
  assert.equal(e.url, 'https://www.movistararena.com.ar/show/993a');
  assert.equal(e.price, 'Desde $60.000');
});

test('Konex: tarjetas con fondo y "Todos los lunes"', () => {
  const html = `<div class="show_top"><a href="https://entradas.cckonex.org/event/la-bomba"><div class="foto" style="background-image:url('https://www.cckonex.org/img.png');"></div></a>
    <div class="categoria"> Música </div><div class="informacion"><p><strong>Todos los lunes</strong><br>20 hs</p></div><div class="nombre"> La Bomba de Tiempo </div><div class="ubicacion"><span>Patio</span></div></div>
    <div class="show_top"><a href="https://entradas.cckonex.org/event/cumbia"></a><div class="informacion"><p>Sábado 28 de noviembre - Medianoche | Puertas 00.30 hs</p></div><div class="nombre">CUMBIA KONEX</div></div>`;
  const sel = { item: '.show_top', title: '.nombre', date: '.informacion', whenText: '.informacion', link: 'a', image: '.foto', place: '.ubicacion', description: '.categoria' };
  const [a, b] = parseHtml(html, 'https://www.cckonex.org/shows/', sel).map((r) => normalizeEvent(r, src, now));
  assert.equal(a.start, '2026-11-09T20:00:00-03:00'); // now = sábado 7 → lunes 9
  assert.equal(a.whenText, 'Todos los lunes 20 hs');
  assert.equal(a.image, 'https://www.cckonex.org/img.png');
  assert.equal(a.category, 'Música');
  assert.equal(b.start, '2026-11-28T00:30:00-03:00');
});

test('Niceto: tarjetas de la agenda', () => {
  const html = `<div class="event-card" data-name="Catalina Ammaturo en Niceto Club (+18 años)" data-lugar="Niceto Club">
    <img src="data:image/svg+xml,x" data-lazy-src="https://images.venti.live/a.jpg"><div style="background:#2E3192;">Concierto</div>
    <div style="padding:8px;"><h3>Catalina Ammaturo en Niceto Club (+18 años)</h3><div style="max-width:90%;"><div style="display:flex;">
    <div style="font-size:32px;font-weight:bold;">13</div><div style=" display:flex; flex-direction:column; font-size:12px;">NOV<br>2026</div><span>|</span>
    <div style="font-size:32px;font-weight:bold;">21</div><div style=" display:flex; flex-direction:column; font-size:12px;">30<br>hs</div></div></div>
    <a href="https://venti.live/evento/catalina">COMPRAR</a></div></div>`;
  const [e] = parseNiceto(html, 'https://nicetoclub.com/agenda/').map((r) => normalizeEvent(r, src, now));
  assert.equal(e.title, 'Catalina Ammaturo');
  assert.equal(e.start, '2026-11-13T21:30:00-03:00');
  assert.equal(e.place, 'Niceto Club');
  assert.equal(e.image, 'https://images.venti.live/a.jpg');
  assert.equal(e.url, 'https://venti.live/evento/catalina');
  assert.equal(e.category, 'Música');
});

test('Fecha ISO sin ceros (Indie Hoy)', () => {
  assert.equal(parseDate('2026-10-7'), '2026-10-07T00:00:00-03:00');
});

test('Enigma Tickets: datos de Remix', () => {
  const ctx = { state: { loaderData: { root: {}, 'routes/_index': { nextEvents: [
    { uid: 'aaa', title: ' NATION OF LANGUAGE', eventDates: [1796007600], venue: { name: 'Deseo Club' }, minPrice: 45000, imageUrl: 'https://assets/a.jpg', schedules: { s: { labelForReplaceDate: 'Lun 30/11 20:30hs' } } },
    { uid: 'bbb', title: 'KAMADA EN MENDOZA', eventDates: [1794697200], venue: { name: 'Foxy' } },
    { uid: 'ccc', title: "Primavera Sound Buenos Aires '26", eventDates: [1795906800, 1795993200], venue: { name: 'Club Ciudad' }, schedules: { x: { labelForReplaceDate: 'Sáb 28/11 + Dom 29/11' } } },
  ] } } } };
  const html = `<script>window.__remixContext = ${JSON.stringify(ctx)};</script>`;
  const raw = parseEnigma(html, 'https://www.enigmatickets.com/', { exclude: 'Mendoza|Foxy' });
  assert.equal(raw.length, 2);
  const [a, b] = raw.map((r) => normalizeEvent(r, { ...src, defaultCategory: 'Música' }, now));
  assert.equal(a.start, '2026-11-30T20:30:00-03:00');
  assert.equal(a.title, 'NATION OF LANGUAGE');
  assert.equal(a.whenText, null);
  assert.equal(a.place, 'Deseo Club');
  assert.equal(a.price, '$45.000');
  assert.equal(a.url, 'https://www.enigmatickets.com/event/aaa');
  assert.equal(b.whenText, 'Sáb 28/11 + Dom 29/11');
  assert.ok(b.end > b.start);
});

test('Bebop Club: tarjetas', () => {
  const html = `<div class="card"><a href="https://ticketera.bebopclub.com.ar/evento/ffb2" aria-label="Ver evento Sheryl Youngblood | Chicago Blues Woman ">
    <img src="/_next/image?url=https%3A%2F%2Fd14.cloudfront.net%2Fabc&amp;w=3840&amp;q=75"/></a><div class="flex flex-col flex-grow p-2"><p class="uppercase">Sheryl Youngblood | Chicago Blues Woman </p>
    <div class="flex"><div class="flex items-end gap-1"><span class="text-4xl font-display">12</span><div class="flex flex-col leading-none pb-0.5"><span class="uppercase">nov</span><span>2026</span></div></div>
    <div class="flex items-end gap-1"><span class="text-4xl font-display">22</span><div class="flex flex-col leading-none pb-0.5"><span>30</span><span>hrs</span></div></div></div>
    <a href="https://ticketera.bebopclub.com.ar/evento/ffb2">Comprar Entradas</a></div></div>`;
  const [e] = parseBebop(html, 'https://bebopclub.com.ar/').map((r) => normalizeEvent(r, { ...src, defaultCategory: 'Música' }, now));
  assert.equal(e.title, 'Sheryl Youngblood | Chicago Blues Woman');
  assert.equal(e.start, '2026-11-12T22:30:00-03:00');
  assert.equal(e.image, 'https://d14.cloudfront.net/abc');
  assert.equal(e.place, 'Bebop Club');
});

test('Livepass: JSON del buscador, solo CABA', () => {
  const body = JSON.stringify({ results: [
    { id: 'pablo-sbaraglia-en-cafe-berlin-2026-11-14-20-30-00-0300', title: 'Pablo Sbaraglia en Café Berlín', location: 'Avenida San Martín 6656, Buenos Aires, Argentina', date: 'Sábado 14 de Noviembre 20:30', url: 'https://livepass.com.ar/events/pablo', price: '33600.0', currency: 'ARS', category: 'TEATRO' },
    { id: 'elgarrista-en-ccnu', title: 'Elgarrista en CCNU', location: 'Uriarte 1289, Buenos Aires, Argentina', date: 'Sábado 14 de Noviembre 20:00', url: 'https://livepass.com.ar/events/elg', price: '17250.0', category: 'SHOW' },
    { id: 'babasonicos', title: 'BABASONICOS en el Hipódromo', location: 'Hipodromo de la Plata, Avenida 44, La Plata, Provincia de Buenos Aires, Argentina', date: 'Sábado 14 de Noviembre 21:00' },
    { id: 'merch', title: 'Merchandising Tiago PZK', location: null, date: 'Martes 24 de Octubre 00:00' },
  ] });
  const raw = parseLivepass(body, 'https://livepass.com.ar/', {});
  assert.equal(raw.length, 3); // Café Berlín y CCNU (CABA) y Babasónicos en La Plata; el merchandising no
  const lp = normalizeEvent(raw.find((r) => /BABASONICOS/.test(r.title)), src, now);
  assert.equal(lp.provincia, 'Buenos Aires');
  assert.equal(lp.localidad, 'La Plata');
  const [a, b] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.start, '2026-11-14T20:30:00-03:00');
  assert.equal(a.category, 'Teatro');
  assert.equal(a.price, '$33.600');
  assert.equal(b.start, '2026-11-14T20:00:00-03:00');
  assert.equal(b.place, 'Uriarte 1289');
});

test('Hora local marcada como UTC (Jazz Voyeur)', () => {
  const html = `<script type="application/ld+json">{"@context": "http://schema.org","@type": "Event","name":"MARINA RUIZ MATTA TRÍO","startDate":"2026-11-11T20:00+0:00","location":{"@type":"Place","name":"Jazz Voyeur Club"}}</script>`;
  const [r] = parseAuto(html, 'https://jazzvoyeur.com.ar/');
  r.start = r.start.replace(/(Z|[+-]\d{1,2}:?\d{2})$/, '');
  assert.equal(normalizeEvent(r, src, now).start, '2026-11-11T20:00:00-03:00');
});

test('TuEntrada: datos de Next.js', () => {
  const objs = [
    { id: 202, model: 'event', slug: 'hmerlo4tet-prez', name: 'HERNAN MERLO 4TET', venue: 'Prez Jazz & Music Club', imageMainNew: { src: 'https://bucket/h.jpg' }, dateRange: '12-11-2026 21:00 hs' },
    { id: 7, model: 'event', slug: 'godzilla', name: 'GODZILLA MINUS ZERO', venue: 'Teatro Gran Rex', dateRange: 'Del 12-11-2026 al 17-11-2026' },
    { id: 1339, model: 'event', slug: 'nicoserna-pinamar', name: 'NICO SERNA', venue: 'Teatro De La Torre', dateRange: '12-11-2026 20:30 hs' },
  ];
  const chunk = JSON.stringify('1a:["$","div",null,{"items":' + JSON.stringify(objs) + '}]');
  const html = `<script>self.__next_f.push([1,${chunk}])</script>`;
  const raw = parseTuEntrada(html, 'https://www.tuentrada.com/', { venueInclude: 'Gran Rex|Prez' });
  assert.equal(raw.length, 2);
  const [a, b] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.start, '2026-11-12T21:00:00-03:00');
  assert.equal(a.place, 'Prez Jazz & Music Club');
  assert.equal(a.url, 'https://www.tuentrada.com/hmerlo4tet-prez');
  assert.equal(b.whenText, 'Del 12-11-2026 al 17-11-2026');
  assert.equal(b.end, '2026-11-17T23:59:00-03:00');
});

test('TuEntrada: API de sala (Gran Rex)', () => {
  const json = { success: true, data: { events: [
    { id: 842, model: 'event', slug: 'abel-pintos-tgr', name: 'Abel Pintos', availability: 'Agotado', dateRange: 'Del 13-11-2026 al 20-11-2026', imageMainNew: { src: 'https://bucket/a.jpg' } },
    { id: 9, model: 'event', slug: 'djavan-tgr', name: 'DJAVAN', availability: 'Disponible', dateRange: '24-11-2026 20:30 hs' },
    { id: 10, model: 'event', slug: 'back-tgr', name: 'BACK TO THE ORCHESTRA', availability: 'Cancelado', dateRange: '29-11-2026 20:00 hs' },
  ] } };
  const raw = eventsFromVenueApi(json, { name: 'Teatro Gran Rex', address: 'Av. Corrientes 857' }, 'https://www.tuentrada.com/');
  assert.equal(raw.length, 2);
  const [a, b] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.whenText, 'Del 13-11-2026 al 20-11-2026 · Agotado');
  assert.equal(b.start, '2026-11-24T20:30:00-03:00');
  assert.equal(b.place, 'Teatro Gran Rex');
  assert.equal(b.url, 'https://www.tuentrada.com/djavan-tgr');
});

const tuCard = (slug, t, estado, fecha, donde) => `<a class="block w-full" href="${slug}"><div><img alt="${t}" src="https://bucket/${slug}.jpg"></div><div><h2>${t}</h2>
  <span class="inline-flex rounded-full">${estado}</span><span><svg class="lucide lucide-calendar-days"></svg>${fecha}</span><span><svg class="lucide lucide-map-pin"></svg>${donde}</span></div></a>`;
await testAsync('TuEntrada: búsqueda paginada, solo CABA', async () => {
  const cur = Buffer.from(JSON.stringify({ date_start: '2026-11-21 21:00:00', id: 1718, _pointsToNextItems: true })).toString('base64');
  const prev = Buffer.from(JSON.stringify({ id: 1, _pointsToNextItems: false })).toString('base64');
  const p1 = tuCard('puig-plata', 'Arturo Puig en Buenas Palabras', 'Disponible', 'Del 21-11-2026 al 22-11-2026', 'Teatro El Plata, Buenos Aires')
    + tuCard('lajenny-escobar', 'LA JENNY', 'Últimas Entradas', '15-11-2026 19:00 hs', 'Teatro Seminari, Belén De Escobar')
    + `<a href="busqueda?categoria=teatro&cursor=${prev}">Anterior</a><a href="busqueda?categoria=teatro&cursor=${cur}">Siguiente</a>`;
  const p2 = tuCard('sumo-rondeman', 'Living Rondewine - Sumo', 'Últimas Entradas', '21-11-2026 21:00 hs', 'Rondeman Abasto, Buenos Aires');
  const ctx = { fetch: async (u) => { assert.ok(u.includes(cur)); return p2; }, warn: () => {} };
  const raw = await tuentradaSearch(p1, 'https://www.tuentrada.com/busqueda?categoria=teatro', { options: { category: 'Teatro' } }, ctx);
  assert.equal(raw.length, 3); // El Plata (CABA), La Jenny (Escobar, GBA) y Sumo (CABA)
  const [a, j, b] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.zona, 'CABA');
  assert.equal(j.zona, 'GBA');
  assert.equal(j.localidad, 'Belén de Escobar');
  assert.equal(a.place, 'Teatro El Plata');
  assert.equal(a.category, 'Teatro');
  assert.equal(b.start, '2026-11-21T21:00:00-03:00');
  assert.equal(b.whenText, 'Últimas Entradas');
  assert.equal(b.url, 'https://www.tuentrada.com/sumo-rondeman');
});

test('Zonas: CABA, GBA y fuera del AMBA', () => {
  assert.equal(zonaDe('Capital Federal'), 'CABA');
  assert.equal(zonaDe('Buenos Aires'), 'CABA');
  assert.equal(zonaDe('Lomas de Zamora'), 'GBA');
  assert.equal(zonaDe('San Justo'), 'GBA');
  assert.equal(zonaDe('Belén De Escobar'), 'GBA');
  assert.equal(zonaDe('La Plata'), null);
  assert.equal(ubicar({ ciudad: 'Rosario', provincia: 'Santa Fé' }).provincia, 'Santa Fe');
  assert.equal(ubicar({ ciudad: 'Montevideo' }), null);
  assert.equal(ubicar({ ciudad: 'Concepción del Uruguay', provincia: 'Entre Ríos' }).provincia, 'Entre Ríos');
  assert.equal(ubicar({ ciudad: 'Punta del Este' }), null);
  assert.equal(ubicar({ ciudad: 'Buenos Aires', provincia: 'Provincia de Buenos Aires' }).provincia, 'CABA');
  assert.equal(ubicar({ ciudad: 'Florida', provincia: 'Provincia de Buenos Aires' }).zona, 'GBA');
  assert.equal(zonaDe('Palermo'), 'CABA');
  assert.equal(zonaDe('Barrio San Nicolas'), 'CABA');
  assert.equal(zonaDe('Microcentro'), 'CABA');
  assert.equal(zonaDe('Ciudad Autonoma de Buenos Aires'), 'CABA');
  assert.equal(zonaDe('Mar del Plata'), null);
  assert.deepEqual(livepassZona('Paunero 1500, San Miguel, Provincia de Buenos Aires, Argentina'), { provincia: 'Buenos Aires', zona: 'GBA', localidad: 'San Miguel', place: 'Paunero 1500' });
  assert.equal(livepassZona('Avenida 44, La Plata, Provincia de Buenos Aires, Argentina').localidad, 'La Plata');
  assert.equal(livepassZona('Uriarte 1289, Buenos Aires, Argentina').zona, 'CABA');
  assert.equal(livepassZona('Bv. Oroño 100, Rosario, Santa Fe, Argentina').provincia, 'Santa Fe');
  assert.equal(livepassZona('Rambla 1, Montevideo, Uruguay').zona, 'fuera');
});

test('Plateanet: obras con funciones, CABA y GBA', () => {
  const obras = [
    { Id: '35310', cNombre: '1000 HORAS - TRIBUTO LOS ABUELOS DE LA NADA', cCategoria: 'RECITAL', cZona: 'CABA', cUrl: 'https://www.plateanet.com/obra/35310', cImagenBusqueda: 'https://m/1000.jpg',
      cDescripcion: 'Llega al Teatro Premier.&lt;|&gt;Un recorrido', cFechas: ['sábado, 12 diciembre 2026 21:00', 'domingo, 13 diciembre 2026 20:00'], cTeatroID: '32', cTeatroNombre: 'PREMIER' },
    { Id: '2', cNombre: 'OBRA DEL OESTE', cCategoria: 'COMEDIA', cZona: 'GBA Oeste', cUrl: 'https://www.plateanet.com/obra/2', cFechas: ['viernes, 20 noviembre 2026 21:30'], cTeatroID: '90', cTeatroNombre: 'GRAN TEATRO MORON' },
    { Id: '3', cNombre: 'EN LA COSTA', cZona: 'Mar del Plata', cFechas: ['viernes, 20 noviembre 2026 21:30'], cTeatroID: '7', cTeatroNombre: 'ROXY' },
  ];
  const teatros = { success: true, objeto: [
    { Id: 32, Name: 'PREMIER', cTipo: 'Teatro', Direccion: 'Av. Corrientes 1565, Buenos Aires, Argentina', Zona: 'CABA' },
    { Id: 90, Name: 'GRAN TEATRO MORON', cTipo: 'Teatro', Direccion: 'Alte. Brown 1200, Morón, Provincia de Buenos Aires, Argentina', Zona: 'GBA Oeste' },
  ] };
  const raw = parsePlateanet(JSON.stringify(obras), JSON.stringify(teatros), 'https://www.plateanet.com/');
  assert.equal(raw.length, 4);
  const [a, b, c, d] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(d.provincia, 'Buenos Aires');
  assert.equal(d.localidad, 'Mar del Plata');
  assert.equal(a.title, '1000 Horas – Tributo los Abuelos de la Nada');
  assert.equal(a.place, 'Teatro Premier');
  assert.equal(a.start, '2026-12-12T21:00:00-03:00');
  assert.equal(a.category, 'Música');
  assert.equal(a.zona, 'CABA');
  assert.equal(b.start, '2026-12-13T20:00:00-03:00');
  assert.equal(c.zona, 'GBA');
  assert.equal(c.provincia, 'Buenos Aires');
  assert.equal(c.localidad, 'Morón');
  assert.equal(c.address, 'Alte. Brown 1200');
  assert.equal(c.place, 'Gran Teatro Moron');
});

test('Festivalear: festivales de todo el país', () => {
  const card = (slug, fecha, tit, ub) => `<a class="fl-card" href="https://festivalear.com/ar/es/eventos/${slug}"><span class="fl-card-media"><img src="https://festivalear.com/img/${slug}.jpg"></span>
    <span class="fl-card-body"><span class="fl-card-fecha">${fecha}</span><span class="fl-card-tit">${tit}</span><span class="fl-card-ub">${ub}</span></span></a>`;
  const html = card('serenata', '3 de enero de 2027', '★Festival de la Serenata', 'Villa de Soto, Córdoba')
    + card('jesus-maria', '8 al 18 de enero de 2027', 'Festival de Jesús María', 'Jesús María, Córdoba')
    + card('vendimia', '28 de febrero al 7 de marzo de 2027', 'Fiesta Nacional de la Vendimia', 'Mendoza, Mendoza')
    + card('chaya', 'Fecha a confirmar', 'Chaya de los Mojones', 'Maimará, Jujuy')
    + card('reyes', '2 al 5 de enero de 2027', 'Fiesta de Reyes Magos', 'Sierra de la Ventana, Buenos Aires');
  const raw = parseFestivalear(html, 'https://festivalear.com/ar/es/eventos');
  assert.equal(raw.length, 4);
  const [a, b, c, d] = raw.map((r) => normalizeEvent(r, src, now));
  assert.equal(a.provincia, 'Córdoba');
  assert.equal(a.title, 'Festival de la Serenata');
  assert.equal(a.localidad, 'Villa de Soto');
  assert.equal(b.start, '2027-01-08T00:00:00-03:00');
  assert.equal(b.end, '2027-01-18T23:59:00-03:00');
  assert.equal(c.start, '2027-02-28T00:00:00-03:00');
  assert.equal(c.provincia, 'Mendoza');
  assert.equal(d.provincia, 'Buenos Aires');
  assert.equal(d.zona, null);
  assert.deepEqual(rangoFestivalear('30 de diciembre al 2 de enero de 2027'), { start: '2026-12-30T00:00:00-03:00', end: '2027-01-02T23:59:00-03:00' });
});

test('Turismo BA: buscador oficial (JSON de actividades)', () => {
  const now3 = new Date('2026-11-13T12:00:00-03:00');
  const acts = [
    { nombre_actividad: 'La Noche de los Museos', proveedor: 'Distintos puntos', calle_altura: 'Ciudad de Buenos Aires', barrio: 'CABA', categoria_actividad_filtro: 'Evento', tags: 'Gratis', precio_filtro: '0', dias_filtro: 'sabado', dias_horarios: 'Sábado 14, de 19 a 02 h. ', url_boton: 'https://turismo/noche', foto: 'https://cdn/noche.webp' },
    { nombre_actividad: 'Mafalda Inmersiva', proveedor: 'Centro Cultural Recoleta', calle_altura: 'Junín 1930', barrio: 'Recoleta', categoria_actividad_filtro: 'Evento', precio_filtro: ' ', dias_filtro: 'jueves,viernes,sabado,domingo', dias_horarios: 'De jueves a domingos' },
    { nombre_actividad: 'Buenos Aires Market', proveedor: 'Plaza Zapiola', dias_filtro: 'sabado', dias_horarios: 'Sábado 14 y domingo 15, 10 a 19 h.' },
    { nombre_actividad: 'Creamfields Argentina', proveedor: 'Parque de la Ciudad', categoria_actividad_filtro: 'Música', dias_filtro: 'sabado', dias_horarios: 'Sábado 14, desde las 15 h. ' },
  ];
  const html = `<body><p>Desde el jueves 12 al domingo 15 de noviembre</p><script type="text/javascript">const json = \` ${JSON.stringify(acts)}\`;</script></body>`;
  const raw = parseTurismoBA(html, 'https://turismo.buenosaires.gob.ar/x', now3);
  const ev = agrupar(raw.map((r) => normalizeEvent(r, src, now3)));
  assert.equal(ev.length, 4);
  assert.equal(ev.find((e) => e.title === 'Buenos Aires Market').start, '2026-11-14T10:00:00-03:00');
  const noche = ev.find((e) => e.title === 'La Noche de los Museos');
  assert.equal(noche.start, '2026-11-14T19:00:00-03:00');
  assert.equal(noche.free, true);
  const mafalda = ev.find((e) => e.title === 'Mafalda Inmersiva');
  assert.equal(mafalda.fechas.length, 4); // jueves 12 a domingo 15
  assert.equal(mafalda.address, 'Junín 1930, Recoleta');
  const cream = ev.find((e) => /Creamfields/.test(e.title));
  assert.equal(cream.start, '2026-11-14T15:00:00-03:00');
  assert.equal(cream.category, 'Música');
});

test('Fechas escritas en texto (Eden sin startDate)', () => {
  assert.deepEqual(rangoDesdeTexto('Sábado 6 y Domingo 7 de Febrero 2027', now), { start: '2027-02-06T00:00:00-03:00', end: '2027-02-07T23:59:00-03:00' });
  assert.deepEqual(rangoDesdeTexto('Del 18 al 21 de Febrero 18:00Hs', now), { start: '2027-02-18T18:00:00-03:00', end: '2027-02-21T23:59:00-03:00' });
  assert.deepEqual(rangoDesdeTexto('Martes 6 de Abril 20:00hs', now), { start: '2027-04-06T20:00:00-03:00', end: null });
  const html = `<script type="application/ld+json">{"@context":"http://schema.org/","@type":"Event","name":"Cosquin Rock 2027","description":"Sábado 6 y Domingo 7 de Febrero 2027",
    "location":{"@type":"Place","name":"Aeródromo de Santa Maria de Punilla","address":{"addressLocality":"Santa Maria de Punilla"}}}</script>`;
  const [r] = parseAuto(html, 'https://www.edenentradas.com/event/cosquin');
  assert.equal(r.start, '2027-02-06T00:00:00-03:00');
  assert.equal(r.ciudad, 'Santa Maria de Punilla');
});

console.log(`\n${passed} pruebas OK`);
