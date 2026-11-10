// Para sitios que arman el contenido con JavaScript sin publicar los datos en un
// archivo (por ejemplo Movistar Arena, hecho en Blazor): los abre con un navegador
// automático (Playwright) y lee las tarjetas con selectores CSS.
import { parseHtml } from './html.mjs';

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import('playwright');
    browserPromise = chromium.launch();
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise).close();
  browserPromise = null;
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
