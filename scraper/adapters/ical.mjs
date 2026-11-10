// Lector mínimo de calendarios iCalendar (.ics), que publican muchos
// centros culturales, teatros y la propia agenda de Google Calendar.

const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

function icsDate(value, params) {
  // 20261108T200000Z | 20261108T200000 | 20261108
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return value;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || /VALUE=DATE(?!-)/.test(params)) return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}${z ? 'Z' : ''}`;
}

export function parseIcal(text, baseUrl) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { baseUrl }; continue; }
    if (line === 'END:VEVENT') { if (ev) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [key, ...params] = line.slice(0, idx).split(';');
    const value = line.slice(idx + 1);
    const p = params.join(';');
    switch (key.toUpperCase()) {
      case 'SUMMARY': ev.title = unescape(value); break;
      case 'DTSTART': ev.start = icsDate(value, p); break;
      case 'DTEND': ev.end = icsDate(value, p); break;
      case 'LOCATION': ev.place = unescape(value); break;
      case 'DESCRIPTION': ev.description = unescape(value); break;
      case 'URL': ev.url = value; break;
    }
  }
  return out;
}
