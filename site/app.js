// Interfaz de la agenda: carga data/events.json y aplica filtros en el navegador.
(() => {
  const TZ = 'America/Argentina/Buenos_Aires';
  const $ = (id) => document.getElementById(id);
  const state = { q: '', free: false, when: 'all', cat: null };
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
  const hasTime = (iso) => !iso.includes('T00:00:00');
  const fmtTime = (iso) => iso.slice(11, 16) + ' h';

  // Un evento de varios días (una muestra, por ejemplo) cuenta en cada día que dura.
  function overlaps(e, from, to) {
    const s = dayKey(e.start);
    const end = e.end ? dayKey(e.end) : s;
    return s <= to && end >= from;
  }

  function range() {
    const t = todayKey();
    switch (state.when) {
      case 'today': return [t, t];
      case 'tomorrow': return [addDays(t, 1), addDays(t, 1)];
      case 'week': return [t, addDays(t, 6)];
      case 'weekend': {
        const dow = new Date(`${t}T12:00:00-03:00`).getDay(); // 0 domingo
        if (dow === 0) return [t, t];
        const fri = addDays(t, (5 - dow + 7) % 7);
        const from = dow >= 5 ? t : fri;
        return [from, addDays(t, 7 - dow)];
      }
      default: return [t, '9999-12-31'];
    }
  }

  function filtered() {
    const [from, to] = range();
    const q = norm(state.q);
    return data.events.filter((e) =>
      overlaps(e, from, to) &&
      (!state.free || e.free) &&
      (!state.cat || e.category === state.cat) &&
      (!q || norm(`${e.title} ${e.place} ${e.address} ${e.description}`).includes(q)));
  }

  function card(e) {
    const multi = e.end && dayKey(e.end) !== dayKey(e.start);
    const when = e.whenText ? e.whenText : multi ? `Hasta el ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(e.end))}`
      : hasTime(e.start) ? fmtTime(e.start) : 'Todo el día';
    const links = e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">Ver en ${esc(s.name)} ↗</a>`).join('');
    return `<article class="card">
      ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="body">
        <div class="meta"><span class="time">${esc(when)}</span><span class="tag">${esc(e.category)}</span>
          ${e.price ? `<span class="price ${e.free ? 'free' : ''}">${esc(e.price)}</span>` : ''}</div>
        <h3>${esc(e.title)}</h3>
        ${e.place ? `<p class="place">📍 ${esc(e.place)}${e.address && e.address !== e.place ? ` · ${esc(e.address)}` : ''}</p>` : ''}
        ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ''}
        <div class="links">${links}</div>
      </div></article>`;
  }

  function render(keepLimit) {
    if (!keepLimit) limit = PAGE;
    const all = filtered();
    const list = all.slice(0, limit);
    const [from] = range();
    $('count').textContent = all.length ? `${all.length} ${all.length === 1 ? 'evento' : 'eventos'}` : '';
    if (!data.events.length) {
      $('list').innerHTML = `<div class="empty"><strong>Todavía no hay eventos cargados</strong>La agenda se completa sola en la próxima actualización automática.</div>`;
      return;
    }
    if (!list.length) {
      $('list').innerHTML = `<div class="empty"><strong>No encontramos eventos con esos filtros</strong>Probá con otra fecha o categoría.</div>`;
      return;
    }
    // Agrupar por día; los de varios días aparecen en el primer día visible
    const groups = new Map();
    for (const e of list) {
      const k = dayKey(e.start) < from ? from : dayKey(e.start);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const t = todayKey();
    $('list').innerHTML = [...groups.keys()].sort().map((k) => {
      const label = k === t ? 'Hoy' : k === addDays(t, 1) ? 'Mañana' : '';
      return `<div class="day"><h2>${esc(fmtDay(k))}</h2>${label ? `<span>${label}</span>` : ''}</div>
        <div class="grid">${groups.get(k).map(card).join('')}</div>`;
    }).join('') + (all.length > limit ? `<div class="more"><button id="more">Ver más eventos (${all.length - limit} restantes)</button></div>` : '');
    const more = $('more');
    if (more) more.onclick = () => { limit += PAGE; render(true); };
  }

  function renderCats() {
    const counts = {};
    for (const e of data.events) counts[e.category] = (counts[e.category] || 0) + 1;
    const cats = Object.keys(counts).sort((a, b) => (a === 'Otros') - (b === 'Otros') || counts[b] - counts[a]);
    $('cats').innerHTML = cats.map((c) => `<button data-cat="${esc(c)}">${esc(c)} <small>${counts[c]}</small></button>`).join('');
  }

  function renderFooter() {
    if (data.generatedAt) {
      $('updated').textContent = 'Última actualización: ' + new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', timeZone: TZ }).format(new Date(data.generatedAt));
    }
    $('sources').innerHTML = (data.sources || []).map((s) =>
      `<li class="${s.ok ? '' : 'bad'}">${esc(s.name)}: ${s.count} eventos${s.note ? ` (${esc(s.note)})` : ''}${!s.ok && !s.note ? ' (sin respuesta en la última actualización)' : ''}</li>`).join('');
  }

  $('q').addEventListener('input', (ev) => { state.q = ev.target.value; render(); });
  $('free').addEventListener('change', (ev) => { state.free = ev.target.checked; render(); });
  $('when').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    state.when = b.dataset.when;
    $('when').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  $('cats').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    state.cat = state.cat === b.dataset.cat ? null : b.dataset.cat;
    $('cats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.cat === state.cat));
    render();
  });

  fetch('data/events.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { events: [] }))
    .catch(() => ({ events: [] }))
    .then((d) => { data = { events: [], sources: [], ...d }; renderCats(); renderFooter(); render(); });
})();
