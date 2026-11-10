// Pruebas con páginas de ejemplo (no necesitan internet): npm test
import assert from 'node:assert/strict';
import { parseAuto } from './adapters/jsonld.mjs';
import { parseHtml } from './adapters/html.mjs';
import { parseIcal } from './adapters/ical.mjs';
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

console.log(`\n${passed} pruebas OK`);
