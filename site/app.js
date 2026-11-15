// Interfaz de la agenda: carga data/events.json y aplica filtros en el navegador.
// Cada evento puede tener varias funciones (e.fechas): se muestra una sola tarjeta,
// ubicada en el primer día con función dentro del rango elegido.
(() => {
  const TZ = 'America/Argentina/Buenos_Aires';
  const $ = (id) => document.getElementById(id);
  const state = { q: '', free: false, when: 'all', mes: '', cat: null, lugar: 'all' };
  const PAGE = 120;
  let limit = PAGE;
  let data = { events: [], sources: [] };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dayKey = (iso) => iso.slice(0, 10); // las fechas ya vienen en hora de Buenos Aires
  const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const addDays = (key, n) => { const d = new Date(`${key}T12:00:00-03:00`); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtDay = (key) => cap(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(`${key}T12:00:00-03:00`)));
  const fmtShort = (iso) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso));
  const fmtMonth = (ym) => cap(new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(`${ym}-15T12:00:00-03:00`)));
  const hasTime = (iso) => !iso.includes('T00:00:00');
  const fmtTime = (iso) => iso.slice(11, 16) + ' h';

  // ---------- Lugar ----------
  const LUGARES = {
    all: { label: 'Todo el país', test: () => true },
    AMBA: { label: 'CABA y Gran Buenos Aires', test: (e) => e.zona === 'CABA' || e.zona === 'GBA' },
    CABA: { label: 'Ciudad de Buenos Aires', test: (e) => e.zona === 'CABA' || e.provincia === 'CABA' },
    GBA: { label: 'Gran Buenos Aires', test: (e) => e.zona === 'GBA' },
    BAI: { label: 'Provincia de Buenos Aires (interior)', test: (e) => e.provincia === 'Buenos Aires' && e.zona !== 'GBA' },
  };
  function buildLugares() {
    const counts = {};
    for (const e of data.events) if (e.provincia && !['CABA', 'Buenos Aires'].includes(e.provincia)) counts[e.provincia] = (counts[e.provincia] || 0) + 1;
    const n = (k) => data.events.filter(LUGARES[k].test).length;
    const fijos = ['all', 'AMBA', 'CABA', 'GBA', 'BAI'].filter((k) => k === 'all' || n(k));
    const provs = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'es'));
    for (const p of provs) LUGARES[`p:${p}`] = { label: p, test: (e) => e.provincia === p };
    $('lugar').innerHTML = fijos.map((k) => `<option value="${k}">${esc(LUGARES[k].label)}${k === 'all' ? '' : ` (${n(k)})`}</option>`).join('')
      + (provs.length ? `<optgroup label="Provincias">${provs.map((p) => `<option value="p:${esc(p)}">${esc(p)} (${counts[p]})</option>`).join('')}</optgroup>` : '');
    $('lugar').value = state.lugar;
  }

  // ---------- Fechas ----------
  function range() {
    const t = todayKey();
    if (state.mes) {
      const from = `${state.mes}-01` < t ? t : `${state.mes}-01`;
      const [y, m] = state.mes.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return [from, last];
    }
    switch (state.when) {
      case 'today': return [t, t];
      case 'tomorrow': return [addDays(t, 1), addDays(t, 1)];
      case 'week': return [t, addDays(t, 6)];
      case 'weekend': {
        const dow = new Date(`${t}T12:00:00-03:00`).getDay(); // 0 domingo
        if (dow === 0) return [t, t];
        const from = dow >= 5 ? t : addDays(t, (5 - dow + 7) % 7);
        return [from, addDays(t, 7 - dow)];
      }
      default: return [t, '9999-12-31'];
    }
  }

  /** Primera función del evento dentro de [from, to] (ISO) o null. */
  function occurrence(e, from, to) {
    if (e.fechas && e.fechas.length) {
      return e.fechas.find((f) => { const d = dayKey(f); return d >= from && d <= to; }) || null;
    }
    const s = dayKey(e.start);
    const end = e.end ? dayKey(e.end) : s;
    if (s > to || end < from) return null;
    return s >= from ? e.start : `${from}T00:00:00-03:00`;
  }

  function filtered() {
    const [from, to] = range();
    const q = norm(state.q);
    const lugar = LUGARES[state.lugar] || LUGARES.all;
    const out = [];
    for (const e of data.events) {
      if (state.free && !e.free) continue;
      if (state.cat && e.category !== state.cat) continue;
      if (!lugar.test(e)) continue;
      if (q && !norm(`${e.title} ${e.place} ${e.address} ${e.localidad} ${e.provincia} ${e.description}`).includes(q)) continue;
      const occ = occurrence(e, from, to);
      if (occ) out.push({ e, occ });
    }
    return out.sort((a, b) => a.occ.localeCompare(b.occ) || a.e.title.localeCompare(b.e.title));
  }

  // ---------- Tarjetas ----------
  function donde(e) {
    const partes = [];
    if (e.localidad) partes.push(e.localidad);
    if (e.provincia && e.provincia !== 'CABA' && e.zona !== 'GBA' && norm(e.provincia) !== norm(e.localidad)) partes.push(e.provincia);
    return partes.join(', ');
  }

  function card({ e, occ }) {
    const n = e.fechas ? e.fechas.length : 0;
    const multiDia = !n && e.end && dayKey(e.end) !== dayKey(e.start);
    const hora = n ? (hasTime(occ) ? fmtTime(occ) : 'Todo el día')
      : multiDia ? `Hasta el ${fmtShort(e.end)}`
      : hasTime(e.start) ? fmtTime(e.start) : 'Todo el día';
    const extra = [];
    if (n > 1) extra.push(`${n} funciones · hasta el ${fmtShort(e.fechas[n - 1])}`);
    if (e.whenText && e.whenText !== hora) extra.push(e.whenText);
    const loc = donde(e);
    const links = e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">Ver en ${esc(s.name)} ↗</a>`).join('');
    return `<article class="card">
      ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="body">
        <div class="meta"><span class="time">${esc(hora)}</span><span class="tag">${esc(e.category)}</span>
          ${e.price ? `<span class="price ${e.free ? 'free' : ''}">${esc(e.price)}</span>` : ''}</div>
        <h3>${esc(e.title)}</h3>
        ${extra.length ? `<p class="funciones">${extra.map(esc).join('<br>')}</p>` : ''}
        ${e.place || loc ? `<p class="place">📍 ${esc(e.place || '')}${e.address && e.address !== e.place ? ` · ${esc(e.address)}` : ''}${loc ? `${e.place ? ' · ' : ''}<span class="loc">${esc(loc)}</span>` : ''}</p>` : ''}
        ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ''}
        <div class="links">${links}</div>
      </div></article>`;
  }

  function render(keepLimit) {
    if (!keepLimit) limit = PAGE;
    const all = filtered();
    const list = all.slice(0, limit);
    $('count').textContent = all.length ? `${all.length.toLocaleString('es-AR')} ${all.length === 1 ? 'evento' : 'eventos'}` : '';
    if (!data.events.length) {
      $('list').innerHTML = `<div class="empty"><strong>Todavía no hay eventos cargados</strong>La agenda se completa sola en la próxima actualización automática.</div>`;
      return;
    }
    if (!list.length) {
      $('list').innerHTML = `<div class="empty"><strong>No encontramos eventos con esos filtros</strong>Probá con otra fecha, lugar o categoría.</div>`;
      return;
    }
    const groups = new Map();
    for (const it of list) {
      const k = dayKey(it.occ);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    const t = todayKey();
    $('list').innerHTML = [...groups.keys()].map((k) => {
      const label = k === t ? 'Hoy' : k === addDays(t, 1) ? 'Mañana' : '';
      return `<div class="day"><h2>${esc(fmtDay(k))}</h2>${label ? `<span>${label}</span>` : ''}</div>
        <div class="grid">${groups.get(k).map(card).join('')}</div>`;
    }).join('') + (all.length > limit ? `<div class="more"><button id="more">Ver más eventos (${(all.length - limit).toLocaleString('es-AR')} restantes)</button></div>` : '');
    const more = $('more');
    if (more) more.onclick = () => { limit += PAGE; render(true); };
  }

  function renderCats() {
    const counts = {};
    for (const e of data.events) counts[e.category] = (counts[e.category] || 0) + 1;
    const cats = Object.keys(counts).sort((a, b) => (a === 'Otros') - (b === 'Otros') || counts[b] - counts[a]);
    $('cats').innerHTML = `<button data-cat="" class="on">Todos <small>${data.events.length.toLocaleString('es-AR')}</small></button>`
      + cats.map((c) => `<button data-cat="${esc(c)}">${esc(c)} <small>${counts[c].toLocaleString('es-AR')}</small></button>`).join('');
  }

  function renderMeses() {
    const t = todayKey().slice(0, 7);
    const hasta = String(data.hasta || '2027-12-31').slice(0, 7);
    const meses = [];
    for (let [y, m] = t.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= hasta; m === 12 ? (y++, m = 1) : m++) meses.push(`${y}-${String(m).padStart(2, '0')}`);
    $('mes').innerHTML = `<option value="">Elegir mes…</option>` + meses.map((ym) => `<option value="${ym}">${fmtMonth(ym)}</option>`).join('');
  }

  function renderFooter() {
    if (data.generatedAt) {
      $('updated').textContent = 'Última actualización: ' + new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', timeZone: TZ }).format(new Date(data.generatedAt));
    }
    // Una línea por sitio (algunos se leen desde varias páginas)
    const porNombre = new Map();
    for (const s of data.sources || []) {
      const p = porNombre.get(s.name) || { name: s.name, count: 0, ok: false, note: null };
      p.count += s.count; p.ok ||= s.ok; p.note ||= s.note;
      porNombre.set(s.name, p);
    }
    $('sources').innerHTML = [...porNombre.values()].map((s) =>
      `<li class="${s.ok ? '' : 'bad'}">${esc(s.name)}: ${s.count} eventos${s.note ? ` (${esc(s.note)})` : ''}${!s.ok && !s.note ? ' (sin respuesta en la última actualización)' : ''}</li>`).join('');
  }

  // ---------- Modo claro / oscuro ----------
  function aplicarTema(oscuro) {
    document.documentElement.dataset.theme = oscuro ? 'dark' : '';
    if (!oscuro) delete document.documentElement.dataset.theme;
    const b = $('tema');
    b.setAttribute('aria-pressed', String(oscuro));
    b.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    b.querySelector('.tema-ico').textContent = oscuro ? '☀️' : '🌙';
    b.querySelector('.tema-txt').textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#040914' : '#4d7559'); // color de la barra del celular
  }
  aplicarTema(document.documentElement.dataset.theme === 'dark');
  $('tema').addEventListener('click', () => {
    const oscuro = document.documentElement.dataset.theme !== 'dark';
    aplicarTema(oscuro);
    try { localStorage.setItem('eventual-tema', oscuro ? 'oscuro' : 'claro'); } catch (e) { /* sin almacenamiento: solo esta visita */ }
  });

  $('q').addEventListener('input', (ev) => { state.q = ev.target.value; render(); });
  $('free').addEventListener('change', (ev) => { state.free = ev.target.checked; render(); });
  $('lugar').addEventListener('change', (ev) => { state.lugar = ev.target.value; render(); });
  $('when').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    state.when = b.dataset.when; state.mes = ''; $('mes').value = '';
    $('when').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  $('mes').addEventListener('change', (ev) => {
    state.mes = ev.target.value;
    $('when').querySelectorAll('button').forEach((x) => x.classList.toggle('on', !state.mes && x.dataset.when === state.when));
    render();
  });
  $('cats').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    state.cat = !b.dataset.cat || state.cat === b.dataset.cat ? null : b.dataset.cat;
    $('cats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x.dataset.cat || null) === state.cat));
    if (window.matchMedia('(min-width: 900px)').matches) window.scrollTo({ top: Math.min(window.scrollY, document.querySelector('.layout').offsetTop - 140), behavior: 'smooth' });
    render();
  });

  fetch('data/events.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { events: [] }))
    .catch(() => ({ events: [] }))
    .then((d) => { data = { events: [], sources: [], ...d }; buildLugares(); renderMeses(); renderCats(); renderFooter(); render(); });
})();
