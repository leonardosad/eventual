// Pruebas con páginas de ejemplo (no necesitan internet): npm test
import assert from 'node:assert/strict';
import { parseAuto } from './adapters/jsonld.mjs';
import { parseHtml } from './adapters/html.mjs';
import { parseIcal } from './adapters/ical.mjs';
import { parseAlternativa } from './adapters/alternativa.mjs';
import { parseTurismoBA, weekRange } from './adapters/turismoba.mjs';
import { normalizeEvent, dedupe, parseDate, categorize } from './normalize.mjs';

const now = new Date('2026-11-07T12:00:00-03:00');
const src = { id: 'test', name: 'Test' };
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`✓ ${name}`); };

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

console.log(`\n${passed} pruebas OK`);
