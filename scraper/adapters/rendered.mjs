// Para sitios que arman el contenido con JavaScript sin publicar los datos en un
// archivo (por ejemplo Movistar Arena, hecho en Blazor): los abre con un navegador
// automático (Playwright) y lee las tarjetas con selectores CSS.
import { parseHtml } from './html.mjs';

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import('playwright');
    // Los servidores de GitHub ya traen Google Chrome: se usa ese y, si no está,
    // el Chromium que descarga Playwright.
    browserPromise = chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise).close();
  browserPromise = null;
}

/** Abre una página con el navegador automático y devuelve el HTML ya armado. */
export async function browserFetch(url, waitFor) {
  const browser = await getBrowser();
  const page = await browser.newPage({ locale: 'es-AR', userAgent: undefined });
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500); // deja terminar desafíos antibots y scripts
    const html = await page.content();
    if (res && res.status() >= 400 && !/ld\+json/.test(html)) throw new Error(`HTTP ${res.status()} (navegador)`);
    return html;
  } finally {
    await page.close();
  }
}

export async function rendered(body, url, source) {
  const browser = await getBrowser();
  const page = await browser.newPage({ locale: 'es-AR' });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector(source.selectors.item, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const html = await page.content();
    return parseHtml(html, url, source.selectors).map((e) => ({
      ...e,
      place: e.place || source.defaultPlace,
      address: e.address || source.defaultAddress,
      whenText: source.selectors.whenText ? e.whenText : null,
    }));
  } finally {
    await page.close();
  }
}
