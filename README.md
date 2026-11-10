# Eventual · Agenda de eventos

Una página que junta en un solo lugar los eventos y actividades de la Ciudad de Buenos Aires: recitales, teatro, muestras, ferias, talleres y planes gratis. La información sale de otros sitios y cada evento enlaza a su fuente original.

Se actualiza sola dos veces por día con GitHub Actions y se publica gratis en GitHub Pages. No necesitás servidor propio.

## Cómo funciona

```
sources.json ──► scraper (Node) ──► site/data/events.json ──► página (site/)
   fuentes          lee y limpia         eventos unificados        filtros y búsqueda
```

1. **`sources.json`**: la lista de sitios de donde se toman los eventos.
2. **`scraper/`**: entra a cada sitio, extrae los eventos, unifica fechas y precios, les asigna una categoría (Música, Teatro, Tango, Ferias…), une los repetidos y descarta los que ya pasaron.
3. **`site/`**: la página web. Tiene búsqueda, filtros por fecha (hoy, mañana, este finde, próximos 7 días), por categoría y "solo gratis".
4. **`.github/workflows/actualizar.yml`**: la tarea automática que corre todo y publica la página.

Si una fuente falla en una actualización, se mantienen sus eventos anteriores para que la página no quede vacía.

## Ponerla en línea (una sola vez, unos 10 minutos)

1. **Creá una cuenta** en [github.com](https://github.com) si no tenés.
2. **Creá un repositorio nuevo**: botón **New**, nombre por ejemplo `eventual`, **Public**, sin README. Clic en **Create repository**.
3. **Subí los archivos.** Lo más fácil es usar [GitHub Desktop](https://desktop.github.com): *File → Add local repository*, elegís la carpeta descomprimida y hacés *Publish*.
   - Si los subís arrastrándolos en la web (*Add file → Upload files*), ojo: la carpeta `.github` está oculta en Windows y Mac. Si no se sube, creala a mano: *Add file → Create new file*, escribí como nombre `.github/workflows/actualizar.yml` y pegá el contenido de ese archivo.
4. **Activá Pages**: en el repositorio, *Settings → Pages → Build and deployment → Source:* elegí **GitHub Actions**.
5. **Corré la primera actualización**: pestaña *Actions → Actualizar agenda → Run workflow*. Tarda 1 o 2 minutos.
6. Tu página queda en `https://leonardosad.github.io/eventual/`.

Después de eso se actualiza sola a las 6:17 y a las 18:17 todos los días.

## Revisar que las fuentes funcionen

En *Actions*, abrí la última ejecución y mirá el paso **Juntar eventos**. Muestra cuántos eventos trajo cada fuente, por ejemplo:

```
→ Eventbrite… 54 eventos
→ Turismo Buenos Aires… 0 eventos
```

Una fuente con **0 eventos** significa que ese sitio no publica sus datos en un formato estándar o cambió su diseño. En ese caso:

- probá otra dirección del mismo sitio (por ejemplo, la página de una categoría), o
- cambiá la fuente a `"type": "html"` con selectores CSS (ver abajo), o
- desactivala con `"enabled": false`.

## Agregar o cambiar fuentes

Todo se configura en `sources.json`. Las dos fuentes activas usan lectores propios:

- **`alternativa`** (Alternativa Teatral): lee el archivo de datos de la cartelera y genera una entrada por obra y por día durante los próximos `daysAhead` días, solo en las provincias indicadas en `provincias`.
- **`turismo-ba`** (Turismo Buenos Aires, "Qué hacer esta semana"): toma las actividades de la semana que figura en el encabezado. Si el sitio no actualizó la semana, esas actividades no aparecen.

Para sumar sitios nuevos hay tres tipos genéricos:

**`auto`** (recomendado): lee los datos de eventos que los sitios publican para Google (schema.org). Funciona con muchas ticketeras y agendas sin configurar nada más.

```json
{ "id": "mi-fuente", "name": "Nombre visible", "type": "auto", "urls": ["https://..."] }
```

**`ical`**: para calendarios `.ics`, que publican muchos centros culturales y cualquier Google Calendar público (*Configuración del calendario → Dirección pública en formato iCal*).

```json
{ "id": "cc-barrio", "name": "Centro Cultural del Barrio", "type": "ical", "urls": ["https://calendar.google.com/calendar/ical/.../public/basic.ics"] }
```

**`html`**: para sitios sin datos estructurados. Indicás qué parte de la página es cada dato, usando selectores CSS. Para encontrarlos, en Chrome hacé clic derecho sobre un evento → *Inspeccionar* y mirá las clases.

```json
{
  "id": "sala-x", "name": "Sala X", "type": "html",
  "urls": ["https://salax.com.ar/agenda"],
  "selectors": { "item": ".evento", "title": "h3", "date": ".fecha", "link": "a", "place": ".lugar", "price": ".precio" },
  "defaultCategory": "Música"
}
```

Las fechas se entienden en formatos como `08/11/2026 20:30`, `8 de noviembre 21 hs` o ISO.

## Probar en tu computadora (opcional)

Con [Node.js](https://nodejs.org) 20 o más nuevo:

```bash
npm install
npm test          # pruebas de los lectores, no usan internet
npm run scrape    # trae los eventos reales
npm run serve     # abre la página en http://localhost:3000
```

## Uso responsable

- La página siempre enlaza a la fuente original y no copia descripciones completas.
- Se consulta cada sitio dos veces por día, con pausas entre pedidos.
- Antes de agregar una fuente, revisá sus términos de uso y su `robots.txt`. Si un sitio pide que no se lo lea automáticamente, sacalo de la lista. Si es un sitio chico, lo mejor es pedirle permiso o su calendario `.ics`.
