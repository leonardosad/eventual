// Herramienta de diagnóstico: abre un sitio con el navegador automático y muestra
// cómo publica sus datos (JSON-LD, APIs que consulta, links a eventos).
// Uso: node tools/sondear.mjs https://sitio.com [https://sitio.com/otra]
import { chromium } from 'playwright';
const urls = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
for (const url of urls) {
  console.log(`\n===== ${url}`);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AgendaCABA/1.0' } });
    const t = await r.text();
    console.log(`fetch directo: HTTP ${r.status}, ${t.length} caracteres, JSON-LD: ${(t.match(/ld\+json/g) || []).length}, __NEXT_DATA__: ${t.includes('__NEXT_DATA__')}`);
    console.log('Meta:', (t.match(/<meta[^>]+(og:|twitter:|description)[^>]*>/g) || []).slice(0, 8).join('\n  '));
    const i = t.search(/href="[^"]*\/event\//);
    if (i >= 0) console.log('HTML alrededor del primer evento:\n' + t.slice(Math.max(0, i - 1500), i + 1500).replace(/\s+/g, ' '));
    const scripts = (t.match(/<script[^>]*>[\s\S]{0,200}/g) || []).filter((x) => /self\.__next_f|__remix|window\.__|application\/json/.test(x)).slice(0, 4);
    if (scripts.length) console.log('Scripts con datos:', scripts.join('\n  '));
    const rm = t.match(/window\.__remixContext\s*=\s*(\{[\s\S]*?\});\s*(?:__remixContext|<\/script>)/);
    if (rm) {
      try {
        const ctx = JSON.parse(rm[1]);
        const ld = ctx.state?.loaderData || {};
        for (const [route, data] of Object.entries(ld)) {
          console.log(`remix loaderData[${route}]: claves ${JSON.stringify(Object.keys(data || {}))}`);
          const findArr = (o, path = '') => { if (Array.isArray(o) && o.length && typeof o[0] === 'object') return [[path, o]]; if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => findArr(v, path + '.' + k)); return []; };
          for (const [path, arr] of findArr(data).slice(0, 6)) console.log(`  arreglo ${path} (${arr.length}): ${JSON.stringify(arr[0]).slice(0, 1500)}`);
        }
      } catch (e) { console.log('remixContext no se pudo leer:', e.message, rm[1].slice(0, 200)); }
    }
  } catch (e) { console.log('fetch directo falló:', e.message); }
  const page = await browser.newPage({ locale: 'es-AR' });
  const apis = [];
  page.on('response', async (res) => {
    const ct = res.headers()['content-type'] || '';
    if (/json/.test(ct) && !/google|facebook|analytics|hotjar|clarity|tiktok|sentry/.test(res.url())) {
      let size = 0; try { size = (await res.body()).length; } catch {}
      apis.push(`${res.request().method()} ${res.status()} ${res.url().slice(0, 200)} (${size} bytes)`);
    }
  });
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    console.log(`navegador: HTTP ${res?.status()}, título: ${await page.title()}`);
    const info = await page.evaluate(() => ({
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.replace(/\s+/g, ' ').slice(0, 300)),
      links: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href))].filter((h) => /event|evento|show|ticket/i.test(h)).slice(0, 25),
      texto: document.body.innerText.replace(/\s+/g, ' ').slice(0, 800),
    }));
    console.log('JSON-LD:', JSON.stringify(info.ld, null, 1));
    console.log('Links:', info.links.join('\n  '));
    console.log('Texto:', info.texto);
    console.log('APIs JSON:\n  ' + apis.slice(0, 30).join('\n  '));
  } catch (e) { console.log('navegador falló:', e.message); }
  await page.close();
}
await browser.close();
