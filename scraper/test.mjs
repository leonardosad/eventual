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
import { normalizeEvent, dedupe, parseDate, categorize } from './normalize.mjs';

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
  const raw = parseAlternativa(body, 'https://www.alternativateatral.com/get-json.php', { daysAhead: 14 }, now2);
  assert.equal(raw.length, 3); // lunes 9, 16 y 23; la de La Plata queda afuera
  const e = normalizeEvent(raw[0], src, now2);
  assert.equal(e.start, '2026-11-09T19:00:00-03:00');
  assert.equal(e.whenText, '19:00 y 21:30 h');
  assert.equal(e.place, 'EL GALPÓN DE GUEVARA');
  assert.equal(e.url, 'https://www.alternativateatral.com/obra99976-las-adoro');
  assert.equal(e.image, 'https://img.alternativateatral.com/x.jpg');
  assert.equal(e.category, 'Teatro');
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

console.log(`\n${passed} pruebas OK`);
